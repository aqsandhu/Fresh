#!/usr/bin/env bash
# Audit fixes T0–T8 (2026-10-31) against the real API + PostgreSQL.
#   T0 slot capacity unlimited unless the admin sets a limit
#   T1 per-order rider pay counted in profit, "per-order pay" expense not twice
#   T2 atta charges editable (super admin), free-from-threshold rule
#   T3 delivery charges per city with a global default
#   T5 customer push honours notification_enabled (DB side)
#   T8 server rejects a today-slot past the admin cutoff %
# Needs JWT_SECRET exported (customer token) + curl + jq. Fresh DB.
set -u
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }

CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
CITY2=$($PSQL -c "insert into service_cities (name, province) values ('Sialkot','Punjab') on conflict do nothing returning id"); [ -n "$CITY2" ] || CITY2=$($PSQL -c "select id from service_cities where name='Sialkot'")
ATOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03001112222","password":"Admin12345"}' | jq -r .data.tokens.accessToken)
AH=(-H "Authorization: Bearer $ATOK" -H 'Content-Type: application/json')
ACH=("${AH[@]}" -H "X-City-Id: $CITY")

# ── T0: unlimited slot ───────────────────────────────────────────────────────
NOWPK=$($PSQL -c "select to_char((now() at time zone 'Asia/Karachi'), 'HH24:MI')")
S_OPEN=$($PSQL -c "select to_char((now() at time zone 'Asia/Karachi') - interval '10 minutes', 'HH24:MI')")
E_OPEN=$($PSQL -c "select to_char((now() at time zone 'Asia/Karachi') + interval '110 minutes', 'HH24:MI')")
R=$(curl -s -X POST $API/admin/settings/time-slots "${AH[@]}" -d "{\"start_time\":\"$S_OPEN\",\"end_time\":\"$E_OPEN\",\"max_orders\":null,\"is_active\":true}")
SLOT=$(echo "$R" | jq -r .data.id)
check "T0 slot saved with no limit (NULL)" "$($PSQL -c "select coalesce(max_orders::text,'NULL') from time_slots where id='$SLOT'")" "NULL"
R=$(curl -s -X POST $API/admin/settings/time-slots "${AH[@]}" -d "{\"start_time\":\"$E_OPEN\",\"end_time\":\"23:59\",\"max_orders\":0,\"is_active\":true}")
check "T0 max_orders 0 is stored as unlimited, not 'full'" "$($PSQL -c "select coalesce(max_orders::text,'NULL') from time_slots where id='$(echo "$R" | jq -r .data.id)'")" "NULL"
R=$(curl -s "$API/orders/time-slots?city_id=$CITY")
check "T0 /orders/time-slots shows 9999 for unlimited" "$(echo "$R" | jq -r --arg s "$SLOT" '[.data[]? // .data.slots[]? | select(.id==$s)][0].available_slots')" "9999"
check "T0 is_unlimited flag" "$(echo "$R" | jq -r --arg s "$SLOT" '[.data[]? // .data.slots[]? | select(.id==$s)][0].is_unlimited')" "true"
R=$(curl -s "$API/site-settings/time-slots?city_id=$CITY")
check "T0 /site-settings/time-slots shows 9999" "$(echo "$R" | jq -r --arg s "$SLOT" '[.data[]? // .data.slots[]? | select(.id==$s)][0].available_slots')" "9999"
R=$(curl -s -X PUT $API/admin/settings/time-slots/$SLOT "${AH[@]}" -d '{"max_orders":-3}')
check "T0 negative limit refused" "$(echo "$R" | jq -r .success)" "false"

# ── shop data: category, product in each city, customer + address ────────────
CAT=$($PSQL -c "insert into categories (name_en, name_ur, slug) values ('Sabzi','سبزی','sabzi-t') returning id")
P1=$($PSQL -c "insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active) values ('Aloo','آلو','aloo-t1','$CAT',200,500,'$CITY',true) returning id")
CUST=$($PSQL -c "insert into users (phone, full_name, role, is_phone_verified) values ('+923361119991','Fix Customer','customer',true) returning id")
ADDR=$($PSQL -c "insert into addresses (user_id, written_address, city) values ('$CUST','House 9','Gujrat') returning id")
CTOK=$(cd /home/user/Fresh/backend && node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({userId:'$CUST',phone:'+923361119991',role:'customer',type:'access'},process.env.JWT_SECRET,{expiresIn:'15m'}))")
CH=(-H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json')
add_cart() { curl -s -X POST $API/cart/add "${CH[@]}" -d "{\"product_id\":\"$P1\",\"quantity\":$1,\"city_id\":\"$CITY\"}" >/dev/null; }

# ── T3: per-city delivery settings ───────────────────────────────────────────
curl -s -X PUT $API/admin/settings/delivery "${AH[@]}" -d '{"base_charge":100,"free_delivery_threshold":5000}' >/dev/null
R=$(curl -s -X PUT $API/admin/settings/delivery "${ACH[@]}" -d '{"base_charge":70,"free_delivery_threshold":3000}')
check "T3 city save ok" "$(echo "$R" | jq -r .success)" "true"
check "T3 public delivery for Gujrat = 70" "$(curl -s "$API/site-settings/delivery?city_id=$CITY" | jq -r .data.base_charge)" "70"
[ -n "$CITY2" ] || { echo "FAIL second city missing"; fail=$((fail+1)); }
check "T3 other city keeps default 100" "$(curl -s "$API/site-settings/delivery?city_id=$CITY2" | jq -r .data.base_charge)" "100"
check "T3 admin GET shows city override" "$(curl -s $API/admin/settings "${ACH[@]}" | jq -r '.data.delivery.city_override')" "true"

# ── T8: cutoff + order placement in the city ─────────────────────────────────
S_LATE=$($PSQL -c "select to_char((now() at time zone 'Asia/Karachi') - interval '80 minutes', 'HH24:MI')")
E_LATE=$($PSQL -c "select to_char((now() at time zone 'Asia/Karachi') + interval '20 minutes', 'HH24:MI')")
LATE=$(curl -s -X POST $API/admin/settings/time-slots "${AH[@]}" -d "{\"start_time\":\"$S_LATE\",\"end_time\":\"$E_LATE\",\"is_active\":true,\"slot_name\":\"late\"}" | jq -r .data.id)
add_cart 2
R=$(curl -s -X POST $API/orders "${CH[@]}" -d "{\"address_id\":\"$ADDR\",\"city_id\":\"$CITY\",\"time_slot_id\":\"$LATE\",\"payment_method\":\"cash_on_delivery\"}")
check "T8 slot past 60% cutoff refused" "$(echo "$R" | jq -r .success)" "false"
echo "   message: $(echo "$R" | jq -r .message)"
R=$(curl -s -X POST $API/orders "${CH[@]}" -d "{\"address_id\":\"$ADDR\",\"city_id\":\"$CITY\",\"time_slot_id\":\"$SLOT\",\"payment_method\":\"cash_on_delivery\"}")
check "T8 open slot accepted" "$(echo "$R" | jq -r .success)" "true"
[ "$(echo "$R" | jq -r .success)" = "true" ] || echo "   message: $(echo "$R" | jq -c '.message, .errors')"
O1=$(echo "$R" | jq -r '.data.id // .data.order.id')
check "T3 order uses Gujrat delivery charge (400 < 3000 → 70)" "$($PSQL -c "select delivery_charge::int from orders where id='$O1'")" "70"
check "T0 unlimited slot booked without a cap" "$($PSQL -c "select coalesce(max_orders::text,'NULL') from time_slots where id='$SLOT'")" "NULL"
curl -s -X PUT $API/admin/settings/delivery "${ACH[@]}" -d '{"reset_to_global":true}' >/dev/null
check "T3 reset city → default again" "$(curl -s "$API/site-settings/delivery?city_id=$CITY" | jq -r .data.base_charge)" "100"

# ── T1: rider pay counted in profit ──────────────────────────────────────────
$PSQL -c "update orders set status='delivered', delivered_at=now(), payment_status='completed', paid_amount=total_amount, rider_delivery_charge=60 where id='$O1'" >/dev/null
P=$(curl -s "$API/finance/profit?period=today" "${ACH[@]}")
check "T1 rider delivery pay line" "$(echo "$P" | jq -r .data.riderDeliveryPay)" "60"
SALE=$(echo "$P" | jq -r .data.totalSale); PROFIT=$(echo "$P" | jq -r .data.profit)
check "T1 profit = sale − rider pay (no other costs)" "$PROFIT" "$(echo "$SALE - 60" | bc | sed 's/\.0*$//')"
RID=$(curl -s -X POST $API/admin/riders -H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY" -F full_name='Fix Rider' -F phone=03139998887 -F password=rider123 -F cnic=3520299988871 -F vehicle_type=bike -F vehicle_number=fx-1 | jq -r .data.id)
curl -s -X POST $API/finance/rider-payment "${ACH[@]}" -d "{\"rider_id\":\"$RID\",\"amount\":60,\"category\":\"commission\"}" >/dev/null
check "T1 'per-order pay' hand-over not deducted twice" "$(curl -s "$API/finance/profit?period=today" "${ACH[@]}" | jq -r .data.profit)" "$PROFIT"
curl -s -X POST $API/finance/rider-payment "${ACH[@]}" -d "{\"rider_id\":\"$RID\",\"amount\":25,\"category\":\"salary\"}" >/dev/null
check "T1 salary is deducted" "$(curl -s "$API/finance/profit?period=today" "${ACH[@]}" | jq -r .data.profit)" "$(echo "$PROFIT - 25" | bc | sed 's/\.0*$//')"

# ── T2: atta charges ─────────────────────────────────────────────────────────
R=$(curl -s -X PUT $API/admin/settings/atta-charges "${AH[@]}" -d '{"service_charge":40,"milling_charge_per_kg":8,"delivery_charge":120,"free_delivery_threshold_kg":25}')
check "T2 super admin saves atta charges" "$(echo "$R" | jq -r .success)" "true"
C=$(curl -s $API/atta-requests/charges)
check "T2 public charges live" "$(echo "$C" | jq -r '[.data.service_charge,.data.milling_charge_per_kg,.data.delivery_charge,.data.free_delivery_threshold_kg]|join(",")')" "40,8,120,25"
AR=$(curl -s -X POST $API/atta-requests "${CH[@]}" -d "{\"address_id\":\"$ADDR\",\"wheat_quantity_kg\":25,\"flour_type\":\"fine\",\"city_id\":\"$CITY\"}")
check "T2 25 kg (= threshold) → free delivery, total 240" "$(echo "$AR" | jq -r '.data.total_amount // .data.totalAmount' | sed 's/\.0*$//')" "240"
AR=$(curl -s -X POST $API/atta-requests "${CH[@]}" -d "{\"address_id\":\"$ADDR\",\"wheat_quantity_kg\":10,\"flour_type\":\"fine\",\"city_id\":\"$CITY\"}")
check "T2 10 kg → 40 + 80 + 120 = 240" "$(echo "$AR" | jq -r '.data.total_amount // .data.totalAmount' | sed 's/\.0*$//')" "240"

# ── T5: notification preference + complaint reply inbox ──────────────────────
R=$(curl -s -X PUT $API/auth/profile "${CH[@]}" -d '{"notification_enabled":"nope"}')
check "T5 non-boolean preference refused" "$(echo "$R" | jq -r .success)" "false"
R=$(curl -s -X PUT $API/auth/profile "${CH[@]}" -d '{"notification_enabled":false}')
check "T5 preference saved" "$($PSQL -c "select notification_enabled from users where id='$CUST'")" "f"
add_cart 1
O2=$(curl -s -X POST $API/orders "${CH[@]}" -d "{\"address_id\":\"$ADDR\",\"city_id\":\"$CITY\",\"time_slot_id\":\"$SLOT\",\"payment_method\":\"cash_on_delivery\"}" | jq -r '.data.id // .data.order.id')
R=$(curl -s -X PUT $API/admin/orders/$O2/status "${ACH[@]}" -d '{"status":"cancelled","reason":"Shop closed early"}')
check "T5 admin cancel ok" "$(echo "$R" | jq -r .success)" "true"
check "T5 exactly one inbox row for the cancel (trigger, no duplicate)" "$($PSQL -c "select count(*) from notifications where order_id='$O2' and type='cancelled'")" "1"
TK=$(curl -s -X POST $API/complaints "${CH[@]}" -d "{\"order_id\":\"$O1\",\"category\":\"quality\",\"subject\":\"Aloo kharab\",\"message\":\"Some potatoes were soft\"}" | jq -r '.data.id')
R=$(curl -s -X PUT $API/admin/complaints/$TK "${ACH[@]}" -d '{"adminResponse":"Sorry — we will replace them tomorrow."}')
check "T5 complaint reply saved" "$(echo "$R" | jq -r .success)" "true"
sleep 1
check "T5 complaint reply reaches the customer inbox" "$($PSQL -c "select count(*) from notifications where user_id='$CUST' and title='Reply to your complaint'")" "1"
# ── T6: "today" is the Pakistan day (01 min after / before PKT midnight) ──────
PKMID="((now() at time zone 'Asia/Karachi')::date::timestamp at time zone 'Asia/Karachi')"
$PSQL -c "insert into expenses (city_id, type, category, amount, comment, incurred_at) values ('$CITY','other','tz',11,'tz-after-midnight',$PKMID + interval '1 minute'), ('$CITY','other','tz',13,'tz-before-midnight',$PKMID - interval '1 minute')" >/dev/null
E=$(curl -s "$API/finance/expenses?period=today" "${ACH[@]}")
check "T6 expense 00:01 PKT is today" "$(echo "$E" | jq -r '[(.data.expenses // .data)[]? | select(.comment=="tz-after-midnight")] | length')" "1"
check "T6 expense 23:59 PKT yesterday is not today" "$(echo "$E" | jq -r '[(.data.expenses // .data)[]? | select(.comment=="tz-before-midnight")] | length')" "0"
echo "RESULT pass=$pass fail=$fail"
