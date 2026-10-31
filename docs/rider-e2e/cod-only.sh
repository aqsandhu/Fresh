#!/usr/bin/env bash
# COD-only: the API refuses non-cash orders and a rider cannot hand over an
# unpaid non-cash order (e.g. a legacy row). Needs JWT_SECRET exported.
set -u
BACKEND_DIR="$(cd "$(dirname "$0")/../../backend" && pwd)"
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
SLOT=$($PSQL -c "select id from time_slots order by start_time limit 1")
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }
CUST=$($PSQL -c "insert into users (phone, full_name, role, is_phone_verified) values ('+923361112224','Cod Customer','customer',true) returning id")
ADDR=$($PSQL -c "insert into addresses (user_id, written_address, city) values ('$CUST','House 3','Gujrat') returning id")
CTOK=$(cd "$BACKEND_DIR" && node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({userId:'$CUST',phone:'+923361112224',role:'customer',type:'access'},process.env.JWT_SECRET,{expiresIn:'10m'}))")
R=$(curl -s -X POST $API/orders -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' -d "{\"address_id\":\"$ADDR\",\"city_id\":\"$CITY\",\"time_slot_id\":\"$SLOT\",\"payment_method\":\"card\"}")
check "card order refused" "$(echo "$R" | jq -r '.success')" "false"
echo "   message: $(echo "$R" | jq -r '.message, (.errors // [] | tostring)' | head -2 | tr '\n' ' ')"

ATOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03001112222","password":"Admin12345"}' | jq -r .data.tokens.accessToken)
AH=(-H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY")
RID=$(curl -s -X POST $API/admin/riders "${AH[@]}" -F full_name='Cod Rider' -F phone=03131234567 -F password=rider123 -F cnic=3520233344451 -F vehicle_type=bike -F vehicle_number=cod-1 | jq -r .data.id)
RTOK=$(curl -s -X POST $API/rider/login -H 'Content-Type: application/json' -d '{"phone":"03131234567","password":"rider123"}' | jq -r .data.tokens.accessToken)
RH=(-H "Authorization: Bearer $RTOK")
curl -s -X PUT $API/rider/status "${RH[@]}" -H 'Content-Type: application/json' -d '{"status":"available"}' >/dev/null
LEGACY=$($PSQL -c "insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, time_slot_id) values ('X','$CUST','$ADDR','ready_for_pickup',700,0,700,'card','pending','{\"written_address\":\"House 3\"}'::jsonb,'$CITY','$SLOT') returning id")
curl -s -X PUT $API/admin/orders/$LEGACY/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RID\"}" >/dev/null
T=$(curl -s $API/rider/tasks/active "${RH[@]}" | jq -r '.data[0].id')
curl -s -X PUT $API/rider/tasks/$T/pickup "${RH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
D=$(curl -s -X PUT $API/rider/tasks/$T/deliver "${RH[@]}" -H 'Content-Type: application/json' -d '{}')
check "unpaid card order cannot be handed over" "$(echo "$D" | jq -r .success)" "false"
echo "   message: $(echo "$D" | jq -r .message)"
check "order still out for delivery" "$($PSQL -c "select status from orders where id='$LEGACY'")" "out_for_delivery"
echo "RESULT pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
