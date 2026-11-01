#!/usr/bin/env bash
# 2026-11-01 human-style QA round — regressions for the bugs and the
# anti-corruption controls (docs/audits/2026-11-01-human-qa-report.md).
# Needs the backend on :3999 against a fresh DB (run after fixes-2026-10-31.sh),
# JWT_SECRET exported, curl, jq, psql, node.
set -u
BACKEND_DIR="$(cd "$(dirname "$0")/../../backend" && pwd)"
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
ATOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03001112222","password":"Admin12345"}' | jq -r .data.tokens.accessToken)
AH=(-H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY" -H 'Content-Type: application/json')
CAT=$($PSQL -c "select id from categories where city_id='$CITY' or city_id is null order by name_en limit 1")

# ── Z1: catalog-v2 fields survive create + update ────────────────────────────
PID=$(curl -s -X POST $API/admin/products -H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY" \
  -F name_en=QaRadish -F name_ur=مولی -F category_id=$CAT -F price=60 -F unit_type=kg \
  -F available_for_restaurants=true -F restaurant_price_a=55 -F restaurant_enabled_a=true -F consumer_enabled_b=false | jq -r .data.id)
check "Z1 create keeps restaurant_enabled_a" "$($PSQL -c "select restaurant_enabled_a from products where id='$PID'")" "t"
curl -s -X PUT $API/admin/products/$PID -H "Authorization: Bearer $ATOK" -H "X-City-Id: $CITY" -F restaurant_enabled_a=false -F half_kg_price_b=25 >/dev/null
check "Z1 update keeps restaurant_enabled_a=false" "$($PSQL -c "select restaurant_enabled_a from products where id='$PID'")" "f"

# ── Z2: shareholder can be created; 100 % cap enforced ───────────────────────
R=$(curl -s -X POST $API/finance/shareholders "${AH[@]}" -d '{"name":"QA Partner","email":"qa.partner@example.com","password":"share123","share_percent":60}')
check "Z2 add shareholder" "$(echo "$R" | jq -r .success)" "true"
check "Z2 cap: 50 % more refused" "$(code -X POST $API/finance/shareholders "${AH[@]}" -d '{"name":"Too Much","email":"too.much@example.com","password":"share123","share_percent":50}')" "400"

# ── a city admin (not super) for the control checks ──────────────────────────
HASH=$(cd "$BACKEND_DIR" && node -e "console.log(require('bcryptjs').hashSync('Manager123',10))")
RID=$($PSQL -c "insert into admin_roles (name, city_id) values ('QA City Manager', '$CITY') returning id")
$PSQL -c "insert into admin_role_permissions (role_id, permission_id) select '$RID', id from permissions" >/dev/null
MID=$(echo "insert into users (phone, full_name, role, password_hash, admin_role_id, is_phone_verified) values ('+923007770077','QA City Manager','admin',:'h','$RID',true) returning id" | $PSQL -v h="$HASH")
$PSQL -c "insert into admins (user_id) values ('$MID')" >/dev/null
MTOK=$(curl -s -X POST $API/admin/login -H 'Content-Type: application/json' -d '{"phone":"03007770077","password":"Manager123"}' | jq -r .data.tokens.accessToken)
MH=(-H "Authorization: Bearer $MTOK" -H 'Content-Type: application/json')

# ── Z3: wrong confirmation password is 400 (not 401 → no forced logout) ─────
RIDER=$($PSQL -c "select id from riders limit 1")
check "Z3 receive-cash wrong password → 400" "$(code -X POST $API/admin/riders/$RIDER/cash-settlements/receive "${AH[@]}" -d '{"password":"nope"}')" "400"
check "Z3 change-password wrong current → 400" "$(code -X POST $API/admin/change-password "${AH[@]}" -d '{"current_password":"nope","new_password":"Whatever123"}')" "400"

# ── Z9: malformed worker id → 404 ────────────────────────────────────────────
check "Z9 worker bad id → 404" "$(code $API/finance/workers/not-a-uuid "${AH[@]}")" "404"

# ── K6: coupon caps for non-super admins ─────────────────────────────────────
check "K6 city admin 100 % coupon refused" "$(code -X POST $API/admin/coupons "${MH[@]}" -d '{"code":"QA100","discount_type":"percentage","discount_value":100}')" "400"
check "K6 city admin capped coupon ok" "$(curl -s -X POST $API/admin/coupons "${MH[@]}" -d '{"code":"QA20","discount_type":"percentage","discount_value":20,"max_discount_amount":300,"usage_limit":100}' | jq -r .success)" "true"
check "K6 super admin may go above" "$(curl -s -X POST $API/admin/coupons "${AH[@]}" -d '{"code":"QAOWNER50","discount_type":"percentage","discount_value":50}' | jq -r .success)" "true"

# ── K8: back-dating limited for non-super admins ─────────────────────────────
OLD=$(date -u -d '40 days ago' +%Y-%m-%dT10:00:00Z); NEW=$(date -u -d '2 days ago' +%Y-%m-%dT10:00:00Z)
check "K8 40-day-old expense refused" "$(code -X POST $API/finance/expenses "${MH[@]}" -d "{\"category\":\"fuel\",\"amount\":100,\"incurred_at\":\"$OLD\"}")" "400"
check "K8 2-day-old expense ok" "$(curl -s -X POST $API/finance/expenses "${MH[@]}" -d "{\"category\":\"fuel\",\"amount\":100,\"incurred_at\":\"$NEW\"}" | jq -r .success)" "true"

# ── K2 + K4: blind shelf count; daily second-admin limit ─────────────────────
PROD=$($PSQL -c "insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active) values ('QaGinger','ادرک','qa-ginger','$CAT',1000,20,'$CITY',true) returning id")
R=$(curl -s -X POST $API/admin/stock/count "${MH[@]}" -d "{\"product_id\":\"$PROD\",\"quality\":\"A\",\"counted_quantity\":18}")
check "K2 shortage of 2 recorded" "$(echo "$R" | jq -r '.data.variance')" "-2"
check "K2 stock now matches the shelf" "$($PSQL -c "select stock_quantity::int from products where id='$PROD'")" "18"
check "K2 ledger row written" "$($PSQL -c "select count(*) from stock_movements where product_id='$PROD' and reason='adjust'")" "1"
R=$(curl -s -X POST $API/admin/stock/count "${MH[@]}" -d "{\"product_id\":\"$PROD\",\"quality\":\"A\",\"counted_quantity\":15}")
check "K4 day total 5,000 → second admin required" "$(echo "$R" | jq -r '.success')" "false"
R=$(curl -s -X POST $API/admin/stock/count "${MH[@]}" -d "{\"product_id\":\"$PROD\",\"quality\":\"A\",\"counted_quantity\":15,\"approval_phone\":\"03001112222\",\"approval_password\":\"Admin12345\"}")
check "K4 with second admin ok" "$(echo "$R" | jq -r '.success')" "true"
check "K4 approver recorded" "$($PSQL -c "select count(*) from stock_counts where product_id='$PROD' and approved_by is not null")" "1"

# ── K13: direct OCP shift is super-admin only ────────────────────────────────
OCP=$($PSQL -c "select id from order_collection_points limit 1")
if [ -n "$OCP" ]; then
  check "K13 city admin direct shift refused" "$(code -X POST $API/admin/stock/shift "${MH[@]}" -d "{\"product_id\":\"$PROD\",\"ocp_id\":\"$OCP\",\"quality\":\"A\",\"quantity\":1}")" "400"
fi

# ── K7: office "Payment received" records the receiver; rider not charged ───
CUST=$($PSQL -c "select id from users where role='customer' and deleted_at is null limit 1")
ADDR=$($PSQL -c "select id from addresses where user_id='$CUST' limit 1")
[ -n "$ADDR" ] || ADDR=$($PSQL -c "insert into addresses (user_id, written_address, city) values ('$CUST','QA house','Gujrat') returning id")
O=$($PSQL -c "insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id, rider_id) values ('X','$CUST','$ADDR','out_for_delivery',650,0,650,'cash_on_delivery','pending','{}'::jsonb,'$CITY','$RIDER') returning id")
curl -s -X PUT $API/admin/orders/$O/payment-received "${AH[@]}" >/dev/null
check "K7 cash receiver recorded" "$($PSQL -c "select cash_received_by is not null from orders where id='$O'")" "t"
check "K7 not in the rider's dues" "$($PSQL -c "select count(*) from orders o where o.id='$O' and o.cash_received_by is null")" "0"

# ── K10: delivered order cannot be deleted ───────────────────────────────────
check "K10 delete delivered → 409" "$(code -X DELETE $API/admin/orders/$O "${AH[@]}")" "409"

# ── K1 guard: status 'refunded' cannot be set ────────────────────────────────
K1C=$(code -X PUT $API/admin/orders/$O/status "${AH[@]}" -d '{"status":"refunded"}')
check "K1 refunded via status refused (400/422)" "$([ "$K1C" = 400 ] || [ "$K1C" = 422 ] && echo refused || echo "$K1C")" "refused"

# ── Z4: dashboard sales exclude cancelled ────────────────────────────────────
C=$($PSQL -c "insert into orders (order_number, user_id, address_id, status, subtotal, delivery_charge, total_amount, payment_method, payment_status, delivery_address_snapshot, city_id) values ('X','$CUST','$ADDR','cancelled',99999,0,99999,'cash_on_delivery','pending','{}'::jsonb,'$CITY') returning id")
DS=$(curl -s $API/admin/dashboard "${AH[@]}" | jq -r '.data.today.total_sales')
check "Z4 cancelled order not in daily sales" "$(awk "BEGIN{print ($DS < 99999)}")" "1"

# ── K12/K3: owner screens are super-admin only ───────────────────────────────
check "K12 audit log: city admin refused" "$(code $API/admin/audit-logs "${MH[@]}")" "403"
check "K12 audit log: super admin ok" "$(curl -s $API/admin/audit-logs "${AH[@]}" | jq -r '.success')" "true"
check "K3 watchdog: city admin refused" "$(code $API/admin/reconciliation "${MH[@]}")" "403"

# ── K9 + K5: watchdog flags an odd purchase and downward weight edits ────────
curl -s -X POST $API/finance/stock-purchase "${MH[@]}" -d "{\"product_id\":\"$PROD\",\"raw_weight\":40,\"purchase_price\":6000,\"grade_a\":20,\"grade_b\":6,\"grade_c\":4,\"waste\":10}" >/dev/null
OI=$($PSQL -c "select id from order_items limit 1"); OID=$($PSQL -c "select order_id from order_items limit 1")
if [ -n "$OI" ]; then
  $PSQL -c "insert into order_item_weight_edits (order_id, order_item_id, edited_by, old_weight, new_weight, delta, old_total, new_total) values ('$OID','$OI','$MID',10,2,-8,2000,400)" >/dev/null
fi
W=$(curl -s -X POST $API/admin/reconciliation/run "${AH[@]}")
check "K9 high purchase waste flagged" "$(echo "$W" | jq -r '[.data.summary.purchases[]? | select(.type=="purchase_waste_high")] | length > 0')" "true"
[ -n "$OI" ] && check "K5 downward weight bias flagged" "$(echo "$W" | jq -r '[.data.summary.weight_bias[]? | select(.net_downward_value != null)] | length > 0')" "true"
check "K7 cash-by-admin listed" "$(echo "$W" | jq -r '(.data.summary.cash_by_admin | length) > 0')" "true"

echo "RESULT pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
