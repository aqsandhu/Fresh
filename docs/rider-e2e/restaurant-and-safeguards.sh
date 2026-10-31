#!/usr/bin/env bash
set -u
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
SLOT=$($PSQL -c "select id from time_slots order by start_time limit 1")
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }
ATOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03001112222","password":"Admin12345"}' | jq -r .data.tokens.accessToken)
AH=(-H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY")
R=$(curl -s -X POST $API/admin/riders "${AH[@]}" -F full_name='Second Rider' -F phone=03451234567 -F password=rider123 -F cnic=3520298765431 -F vehicle_type=rickshaw -F vehicle_number=lhr-9)
RID=$(echo "$R" | jq -r .data.id)
RTOK=$(curl -s -X POST $API/rider/login -H 'Content-Type: application/json' -d '{"phone":"03451234567","password":"rider123"}' | jq -r .data.tokens.accessToken)
RH=(-H "Authorization: Bearer $RTOK")
curl -s -X PUT $API/rider/status "${RH[@]}" -H 'Content-Type: application/json' -d '{"status":"available"}' >/dev/null

REST=$($PSQL -c "insert into restaurants (business_name, phone, pin_hash, city, city_id, status) values ('Karahi House','+923009998887','x','Gujrat','$CITY','approved') returning id")
RO=$($PSQL -c "insert into orders (order_number, restaurant_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, time_slot_id, show_customer_phone) values ('X','$REST','ready_for_pickup',3000,0,3000,'cash_on_delivery','pending', jsonb_build_object('business_name','Karahi House','phone','+923009998887','written_address','GT Road shop 4','location',jsonb_build_object('latitude',32.58,'longitude',74.07),'front_image_url','https://cdn.example.com/front.jpg','is_restaurant',true), '$CITY','$SLOT', true) returning id")
check "assign restaurant order" "$(curl -s -X PUT $API/admin/orders/$RO/assign-rider "${AH[@]}" -H 'Content-Type: application/json' -d "{\"rider_id\":\"$RID\"}" | jq -r .success)" "true"
T=$(curl -s $API/rider/tasks/active "${RH[@]}" | jq -c '.data[0]')
TID=$(echo "$T" | jq -r .id)
check "restaurant flag" "$(echo "$T" | jq -r .is_restaurant)" "true"
check "restaurant name" "$(echo "$T" | jq -r .restaurant_name)" "Karahi House"
check "restaurant phone (visible)" "$(echo "$T" | jq -r .customer_phone)" "+923009998887"
check "restaurant pin from snapshot" "$(echo "$T" | jq -r .address_latitude)" "32.58"
check "storefront photo" "$(echo "$T" | jq -r .door_picture_url)" "https://cdn.example.com/front.jpg"
check "call-request returns restaurant number" "$(curl -s -X POST $API/rider/call-request "${RH[@]}" -H 'Content-Type: application/json' -d "{\"order_id\":\"$RO\"}" | jq -r .data.virtual_number)" "+923009998887"
check "arrival on restaurant order (office told)" "$(curl -s -X POST $API/rider/tasks/$TID/arrived "${RH[@]}" | jq -r .data.reason)" "restaurant"
check "pin restaurant" "$(curl -s -X PUT $API/rider/tasks/$TID/pin-location "${RH[@]}" -H 'Content-Type: application/json' -d '{"latitude":32.5801,"longitude":74.0701}' | jq -r .success)" "true"
check "delete refused with active task" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $API/admin/riders/$RID "${AH[@]}")" "409"
check "admin 'available' with task → busy" "$(curl -s -X PATCH $API/admin/riders/$RID/status "${AH[@]}" -H 'Content-Type: application/json' -d '{"status":"available"}' | jq -r .data.status)" "busy"
check "rider duty toggle with task → busy" "$(curl -s -X PUT $API/rider/status "${RH[@]}" -H 'Content-Type: application/json' -d '{"status":"available"}' | jq -r .data.status)" "busy"
curl -s -X PUT $API/rider/tasks/$TID/pickup "${RH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
# admin goes off-duty for rider mid-task, rider delivers: stays offline
curl -s -X PATCH $API/admin/riders/$RID/status "${AH[@]}" -H 'Content-Type: application/json' -d '{"status":"offline"}' >/dev/null
check "deliver restaurant order" "$(curl -s -X PUT $API/rider/tasks/$TID/deliver "${RH[@]}" -H 'Content-Type: application/json' -d '{}' | jq -r .success)" "true"
check "off-duty rider stays offline after delivery" "$($PSQL -c "select status from riders where id='$RID'")" "offline"
check "delete allowed when free" "$(curl -s -X DELETE $API/admin/riders/$RID "${AH[@]}" | jq -r .success)" "true"
check "deleted rider cannot log in" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/rider/login -H 'Content-Type: application/json' -d '{"phone":"03451234567","password":"rider123"}')" "401"
echo "RESULT pass=$pass fail=$fail"
