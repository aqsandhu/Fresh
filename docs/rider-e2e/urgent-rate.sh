#!/usr/bin/env bash
# Urgent orders pay the rider's dedicated urgent rate (migration 58).
set -u
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
SLOT=$($PSQL -c "select id from time_slots order by start_time limit 1")
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }
ATOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03001112222","password":"Admin12345"}' | jq -r .data.tokens.accessToken)
AH=(-H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY")
RID=$(curl -s -X POST $API/admin/riders "${AH[@]}" -F full_name='Urgent Rider' -F phone=03121234567 -F password=rider123 -F cnic=3520211122231 -F vehicle_type=bike -F vehicle_number=urg-1 | jq -r .data.id)
RTOK=$(curl -s -X POST $API/rider/login -H 'Content-Type: application/json' -d '{"phone":"03121234567","password":"rider123"}' | jq -r .data.tokens.accessToken)
curl -s -X PUT $API/rider/status -H "Authorization: Bearer $RTOK" -H 'Content-Type: application/json' -d '{"status":"available"}' >/dev/null
CUST=$($PSQL -c "insert into users (phone, full_name, role, is_phone_verified) values ('+923351112223','Urgent Customer','customer',true) returning id")
ADDR=$($PSQL -c "insert into addresses (user_id, written_address, city) values ('$CUST','House 9','Gujrat') returning id")
mk() { $PSQL -c "insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, time_slot_id, is_urgent_delivery) values ('X','$CUST','$ADDR','ready_for_pickup',500,0,500,'cash_on_delivery','pending', '{\"written_address\":\"House 9\"}'::jsonb, '$CITY', $1, $2) returning id"; }
assign() { curl -s -X PUT $API/admin/orders/$1/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RID\"}" >/dev/null; $PSQL -c "select rider_delivery_charge::int from orders where id='$1'"; }

curl -s -X PUT $API/admin/riders/$RID/delivery-charges "${AH[@]}" -H 'Content-Type: application/json' -d "{\"charges\":[{\"time_slot_id\":\"$SLOT\",\"charge_per_order\":80}]}" >/dev/null
check "urgent without urgent rate → latest slot rate (fallback)" "$(assign "$(mk NULL true)")" "80"
check "save urgent rate" "$(curl -s -X PUT $API/admin/riders/$RID/delivery-charges "${AH[@]}" -H 'Content-Type: application/json' -d '{"charges":[],"urgent_charge":150}' | jq -r .data.urgent_delivery_charge)" "150"
check "stats returns urgent rate" "$(curl -s $API/admin/riders/$RID/stats "${AH[@]}" | jq -r .data.urgentDeliveryCharge)" "150"
check "urgent order → urgent rate" "$(assign "$(mk NULL true)")" "150"
check "slot order → slot rate" "$(assign "$(mk "'$SLOT'" false)")" "80"
check "negative urgent rate refused" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/riders/$RID/delivery-charges "${AH[@]}" -H 'Content-Type: application/json' -d '{"charges":[],"urgent_charge":-5}')" "400"
check "clear urgent rate" "$(curl -s -X PUT $API/admin/riders/$RID/delivery-charges "${AH[@]}" -H 'Content-Type: application/json' -d '{"charges":[],"urgent_charge":null}' | jq -r .data.urgent_delivery_charge)" "null"
check "slot pay untouched by urgent edits" "$(curl -s $API/admin/riders/$RID/stats "${AH[@]}" | jq -r '.data.deliveryCharges[0].charge_per_order')" "80"
echo "RESULT pass=$pass fail=$fail"
