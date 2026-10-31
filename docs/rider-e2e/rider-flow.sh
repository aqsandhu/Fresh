#!/usr/bin/env bash
# End-to-end rider flow against a local backend + scratch Postgres.
set -u
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
SLOT=$($PSQL -c "select id from time_slots order by start_time limit 1")
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }

ATOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03001112222","password":"Admin12345"}' | jq -r .data.tokens.accessToken)
AH=(-H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY")

# ── Admin creates a rider (multipart) ────────────────────────────────────
R=$(curl -s -X POST $API/admin/riders "${AH[@]}" -F full_name='Test Rider' -F phone=03211234567 -F password=rider123 -F cnic=3520212345671 -F vehicle_type=bike -F vehicle_number=grt-1234)
RIDER_ID=$(echo "$R" | jq -r .data.id)
check "admin create rider" "$(echo "$R" | jq -r .success)" "true"
check "new rider starts off duty" "$(echo "$R" | jq -r .data.status)" "offline"
check "cnic normalised" "$(echo "$R" | jq -r .data.cnic)" "35202-1234567-1"

# full record + list
check "GET /admin/riders/:id" "$(curl -s $API/admin/riders/$RIDER_ID "${AH[@]}" | jq -r .data.vehicle_number)" "GRT-1234"
check "list has active_tasks" "$(curl -s "$API/admin/riders?search=test" "${AH[@]}" | jq -r '.data.riders[0].active_tasks')" "0"

# per-slot pay
curl -s -X PUT $API/admin/riders/$RIDER_ID/delivery-charges "${AH[@]}" -H 'Content-Type: application/json' -d "{\"charges\":[{\"time_slot_id\":\"$SLOT\",\"charge_per_order\":80}]}" >/dev/null
check "stats returns time_slot_id" "$(curl -s $API/admin/riders/$RIDER_ID/stats "${AH[@]}" | jq -r '.data.deliveryCharges[0].time_slot_id')" "$SLOT"

# ── Rider login does NOT put him on duty ─────────────────────────────────
RL=$(curl -s -X POST $API/rider/login -H 'Content-Type: application/json' -d '{"phone":"03211234567","password":"rider123"}')
RTOK=$(echo "$RL" | jq -r .data.tokens.accessToken)
RH=(-H "Authorization: Bearer $RTOK")
check "rider login" "$(echo "$RL" | jq -r .success)" "true"
check "login keeps rider offline" "$($PSQL -c "select status from riders where id='$RIDER_ID'")" "offline"
check "rider goes on duty" "$(curl -s -X PUT $API/rider/status "${RH[@]}" -H 'Content-Type: application/json' -d '{"status":"available"}' | jq -r .data.status)" "available"

# ── Customer + address + ready order (SQL seed) ──────────────────────────
CUST=$($PSQL -c "insert into users (phone, full_name, role, is_phone_verified) values ('+923331234567','Ayesha Khan','customer',true) returning id")
ADDR=$($PSQL -c "insert into addresses (user_id, written_address, house_number, city, location) values ('$CUST','Street 5, Model Town','H-12','Gujrat', ST_SetSRID(ST_MakePoint(74.08,32.57),4326)::geography) returning id")
ORDER=$($PSQL -c "insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, time_slot_id) values ('FB-E2E-1','$CUST','$ADDR','ready_for_pickup',1000,50,1050,'cash_on_delivery','pending', jsonb_build_object('written_address','Street 5, Model Town','house_number','H-12','city','Gujrat'), '$CITY', '$SLOT') returning id")

A=$(curl -s -X PUT $API/admin/orders/$ORDER/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RIDER_ID\"}")
check "admin assigns rider" "$(echo "$A" | jq -r .success)" "true"
check "rider busy after assignment" "$($PSQL -c "select status from riders where id='$RIDER_ID'")" "busy"
check "rider pay snapshotted" "$($PSQL -c "select rider_delivery_charge::int from orders where id='$ORDER'")" "80"

ACT=$(curl -s $API/rider/tasks/active "${RH[@]}")
TASK=$(echo "$ACT" | jq -r '.data[0].id')
ONUM=$($PSQL -c "select order_number from orders where id='$ORDER'")
check "active task visible" "$(echo "$ACT" | jq -r '.data[0].order_number')" "$ONUM"
check "house number from snapshot" "$(echo "$ACT" | jq -r '.data[0].order_house_number')" "H-12"
check "pin from address" "$(echo "$ACT" | jq -r '.data[0].has_location')" "true"
check "customer phone hidden" "$(echo "$ACT" | jq -r '.data[0].customer_phone')" "null"
DET=$(curl -s $API/rider/tasks/$TASK "${RH[@]}")
check "task detail ok" "$(echo "$DET" | jq -r .success)" "true"

# arrived before pickup is allowed (backend), pickup, arrived
check "pickup" "$(curl -s -X PUT $API/rider/tasks/$TASK/pickup "${RH[@]}" -H 'Content-Type: application/json' -d '{}' | jq -r .success)" "true"
ARR=$(curl -s -X POST $API/rider/tasks/$TASK/arrived "${RH[@]}")
check "arrived notifies customer" "$(echo "$ARR" | jq -r .data.notified)" "true"
check "arrived_at stamped" "$($PSQL -c "select arrived_at is not null from rider_tasks where id='$TASK'")" "t"
check "customer inbox row" "$($PSQL -c "select count(*) from notifications where user_id='$CUST' and action_type='rider_arrived'")" "1"
check "repeat arrival throttled" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/rider/tasks/$TASK/arrived "${RH[@]}")" "429"
CALL=$(curl -s -X POST $API/rider/call-request "${RH[@]}" -H 'Content-Type: application/json' -d "{\"order_id\":\"$ORDER\"}")
check "hidden-phone call is throttled arrival (not 403)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/rider/call-request "${RH[@]}" -H 'Content-Type: application/json' -d "{\"order_id\":\"$ORDER\"}")" "429"
echo "   (call-request inside 2-min window answers: $(echo "$CALL" | jq -r .message))"

# customer sees rider phone in tracking
CTOK=$(cd /home/user/Fresh/backend && node -e "
const jwt=require('jsonwebtoken');console.log(jwt.sign({userId:'$CUST',phone:'+923331234567',role:'customer',type:'access'},process.env.JWT_SECRET,{expiresIn:'10m'}))" 2>/dev/null)
TR=$(curl -s $API/orders/track/$ORDER -H "Authorization: Bearer $CTOK")
echo "   tracking: $(echo "$TR" | jq -c '{s:.success, m:.message, rider:.data.rider|{name,phone,vehicle_number}}')"

# weight-edit style notice: proof required? deliver
DEL=$(curl -s -X PUT $API/rider/tasks/$TASK/deliver "${RH[@]}" -H 'Content-Type: application/json' -d '{"notes":"handed to customer"}')
check "deliver" "$(echo "$DEL" | jq -r .success)" "true"
check "order delivered + COD paid" "$($PSQL -c "select status||'/'||payment_status||'/'||paid_amount::int from orders where id='$ORDER'")" "delivered/completed/1050"
check "rider available after last task" "$($PSQL -c "select status from riders where id='$RIDER_ID'")" "available"

ST=$(curl -s $API/rider/stats "${RH[@]}")
check "today orders (Karachi day)" "$(echo "$ST" | jq -r .data.stats.today.orders)" "1"
check "today earnings" "$(echo "$ST" | jq -r .data.stats.today.earnings)" "80"
check "cash in hand" "$(echo "$ST" | jq -r .data.payment.cashInHand)" "1050"
check "hand over" "$(echo "$ST" | jq -r .data.payment.paymentPending)" "970"
check "today endpoint" "$(curl -s $API/rider/stats/today "${RH[@]}" | jq -r .data.totalDeliveries)" "1"

# admin receives cash
RC=$(curl -s -X POST $API/admin/riders/$RIDER_ID/cash-settlements/receive "${AH[@]}" -H 'Content-Type: application/json' -d '{"password":"Admin12345","note":"e2e"}')
check "admin receive cash" "$(echo "$RC" | jq -r .data.amount)" "970"
ST2=$(curl -s $API/rider/stats "${RH[@]}")
check "pending after settle" "$(echo "$ST2" | jq -r .data.payment.paymentPending)" "0"
check "settled total" "$(echo "$ST2" | jq -r .data.payment.totalSettled)" "970"
check "rider settlement history" "$(curl -s $API/rider/cash-settlements "${RH[@]}" | jq -r '.data[0].order_count')" "1"

# ── Failed delivery → admin return to store ──────────────────────────────
ORDER2=$($PSQL -c "insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, time_slot_id) values ('FB-E2E-2','$CUST','$ADDR','ready_for_pickup',500,50,550,'cash_on_delivery','pending', jsonb_build_object('written_address','Street 5, Model Town'), '$CITY', '$SLOT') returning id")
curl -s -X PUT $API/admin/orders/$ORDER2/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RIDER_ID\"}" >/dev/null
TASK2=$(curl -s $API/rider/tasks/active "${RH[@]}" | jq -r '.data[0].id')
check "return refused while rider active" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/admin/orders/$ORDER2/return-to-store "${AH[@]}" -H 'Content-Type: application/json' -d '{}')" "409"
check "problem needs a reason" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/rider/tasks/$TASK2/cancel "${RH[@]}" -H 'Content-Type: application/json' -d '{"reason":""}')" "400"
check "rider reports problem" "$(curl -s -X POST $API/rider/tasks/$TASK2/cancel "${RH[@]}" -H 'Content-Type: application/json' -d '{"reason":"Customer not reachable"}' | jq -r .success)" "true"
ONUM2=$($PSQL -c "select order_number from orders where id='$ORDER2'")
check "admin order list flags failed task" "$(curl -s "$API/admin/orders?search=$ONUM2" "${AH[@]}" | jq -r '.data.orders[0].rider_task_status')" "failed"
check "order detail has rider timeline" "$(curl -s $API/admin/orders/$ORDER2 "${AH[@]}" | jq -r '.data.rider_tasks[0].notes')" "Customer not reachable"
check "return to store" "$(curl -s -X POST $API/admin/orders/$ORDER2/return-to-store "${AH[@]}" -H 'Content-Type: application/json' -d '{"reason":"customer unreachable"}' | jq -r .data.status)" "ready_for_pickup"
check "order can now be cancelled" "$(curl -s -X PUT $API/admin/orders/$ORDER2/status "${AH[@]}" -H 'Content-Type: application/json' -d '{"status":"cancelled","reason":"unreachable"}' | jq -r .data.status)" "cancelled"

# ── Atta: assign pickup rider without moving status ──────────────────────
ATTA=$($PSQL -c "insert into atta_requests (request_number, user_id, address_id, wheat_quantity_kg, special_instructions, total_amount) values ('ATTA-E2E-1','$CUST','$ADDR',20,'Contact: 0300-1234567',250) returning id")
check "atta assign pickup" "$(curl -s -X PUT $API/admin/atta-requests/$ATTA/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RIDER_ID\",\"task_type\":\"atta_pickup\"}" | jq -r .success)" "true"
check "atta status untouched" "$($PSQL -c "select status from atta_requests where id='$ATTA'")" "pending_pickup"
AT=$(curl -s $API/rider/tasks/active "${RH[@]}" | jq -c '.data[] | select(.task_type=="atta_pickup")')
ATASK=$(echo "$AT" | jq -r .id)
check "atta task has address" "$(echo "$AT" | jq -r .order_delivery_address)" "Street 5, Model Town"
check "atta task has contact note" "$(echo "$AT" | jq -r .atta_instructions)" "Contact: 0300-1234567"
check "delivery rider refused before mill" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/atta-requests/$ATTA/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RIDER_ID\",\"task_type\":\"atta_delivery\"}")" "409"
curl -s -X PUT $API/rider/tasks/$ATASK/pickup "${RH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
check "wheat collected → picked_up" "$($PSQL -c "select status from atta_requests where id='$ATTA'")" "picked_up"
curl -s -X PUT $API/rider/tasks/$ATASK/deliver "${RH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
check "dropped at mill → at_mill" "$($PSQL -c "select status from atta_requests where id='$ATTA'")" "at_mill"
$PSQL -c "update atta_requests set status='ready_for_delivery' where id='$ATTA'" >/dev/null
curl -s -X PUT $API/admin/atta-requests/$ATTA/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RIDER_ID\",\"task_type\":\"atta_delivery\"}" >/dev/null
DT=$(curl -s $API/rider/tasks/active "${RH[@]}" | jq -c '.data[] | select(.task_type=="atta_delivery")')
DTASK=$(echo "$DT" | jq -r .id)
check "atta delivery shows amount" "$(echo "$DT" | jq -r '.atta_total_amount|tonumber|floor')" "250"
curl -s -X PUT $API/rider/tasks/$DTASK/pickup "${RH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s -X PUT $API/rider/tasks/$DTASK/deliver "${RH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
check "atta delivered + collected" "$($PSQL -c "select status||'/'||payment_status||'/'||paid_amount::int from atta_requests where id='$ATTA'")" "delivered/completed/250"
check "atta cash due" "$(curl -s $API/rider/stats "${RH[@]}" | jq -r .data.payment.paymentPending)" "250"
check "admin settles atta cash" "$(curl -s -X POST $API/admin/riders/$RIDER_ID/cash-settlements/receive "${AH[@]}" -H 'Content-Type: application/json' -d '{"password":"Admin12345"}' | jq -r .data.atta)" "1"
check "admin atta list shows rider" "$(curl -s $API/admin/atta-requests "${AH[@]}" | jq -r '.data.requests[0].delivery_rider_name')" "Test Rider"

# ── Admin detail endpoints + block ────────────────────────────────────────
check "admin rider history" "$(curl -s "$API/admin/riders/$RIDER_ID/tasks?scope=history" "${AH[@]}" | jq -r '.data.pagination.total')" "4"
check "admin rider feedback" "$(curl -s $API/admin/riders/$RIDER_ID/feedback "${AH[@]}" | jq -r .success)" "true"
check "rider reviews endpoint" "$(curl -s $API/rider/reviews "${RH[@]}" | jq -r .success)" "true"
check "block rider" "$(curl -s -X PATCH $API/admin/riders/$RIDER_ID/verify "${AH[@]}" -H 'Content-Type: application/json' -d '{"verification_status":"rejected"}' | jq -r .data.verification_status)" "rejected"
check "blocked rider REST refused" "$(curl -s -o /dev/null -w '%{http_code}' $API/rider/tasks/active "${RH[@]}")" "403"
check "blocked rider login message" "$(curl -s -X POST $API/rider/login -H 'Content-Type: application/json' -d '{"phone":"03211234567","password":"rider123"}' | jq -r .message)" "Your rider account has been blocked. Please contact the Fresh Bazar office."
echo "RESULT pass=$pass fail=$fail"
