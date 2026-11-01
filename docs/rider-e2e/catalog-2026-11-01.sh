#!/usr/bin/env bash
# Catalog data is real, never placeholder (2026-11-01 storefront audit):
#  - a fresh install seeds no fake products, no dead example.com image URLs
#    and no placeholder WhatsApp number (migration 61 + schema.sql seed);
#  - GET /products pages are stable: 150 products with the SAME price, paged
#    by price, come back exactly once each (ORDER BY …, p.id tie-breaker) —
#    the customer app pages through every page and the website's "Load more"
#    must never repeat or skip a product;
#  - the page cap the clients rely on (100) holds even for limit=2000.
# Needs: backend on :3999 against a fresh database, curl, jq, psql.
set -u
API=http://localhost:3999/api
PSQL="psql -h 127.0.0.1 -p 55432 -U postgres -d fb -Atq"
CITY=$($PSQL -c "select id from service_cities where name='Gujrat' limit 1")
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 — expected [$3] got [$2]"; fail=$((fail+1)); fi; }

# --- no placeholder seed data -------------------------------------------------
check "no seeded sample products" "$($PSQL -c "select count(*) from products where slug in ('potato','tomato','apple','almonds','chicken-breast')")" "0"
check "no example.com category images" "$($PSQL -c "select count(*) from categories where icon_url like '%example.com%' or image_url like '%example.com%'")" "0"
check "no example.com product images" "$($PSQL -c "select count(*) from products where primary_image like '%example.com%'")" "0"
check "no placeholder WhatsApp rows" "$($PSQL -c "select count(*) from site_settings where key='whatsapp_order_url' and value like '%923001234567%'")" "0"
check "public WhatsApp link empty until admin sets it" "$(curl -s "$API/site-settings/whatsapp-order?city_id=$CITY" | jq -r '.data.whatsapp_order_url // ""')" ""
check "real categories still seeded" "$(curl -s "$API/categories?city_id=$CITY" | jq '[.data[] | select(.slug=="vegetables")] | length')" "1"

# --- stable paging ------------------------------------------------------------
CAT=$($PSQL -c "insert into categories (name_en, name_ur, slug) values ('Paging Test','صفحہ','paging-test') returning id")
$PSQL -c "insert into products (name_en, name_ur, slug, category_id, price, stock_quantity, city_id, is_active)
          select 'Same Price '||g, 'ایک', 'same-price-'||g, '$CAT', 99, 5, '$CITY', true from generate_series(1,150) g" >/dev/null
Q="$API/products?category=$CAT&city_id=$CITY&sortBy=price&sortOrder=asc&limit=100"
P1=$(curl -s "$Q&page=1"); P2=$(curl -s "$Q&page=2")
check "page meta total" "$(echo "$P1" | jq -r .meta.total)" "150"
check "page 1 size (cap 100)" "$(echo "$P1" | jq '.data | length')" "100"
check "page 2 size" "$(echo "$P2" | jq '.data | length')" "50"
check "pages hold 150 DISTINCT products" "$( (echo "$P1"; echo "$P2") | jq -r '.data[].id' | sort -u | wc -l | tr -d ' ')" "150"
check "limit=2000 still capped at 100" "$(curl -s "$API/products?city_id=$CITY&limit=2000" | jq -r .meta.limit)" "100"
check "minPrice filter applies" "$(curl -s "$API/products?category=$CAT&city_id=$CITY&minPrice=100" | jq -r .meta.total)" "0"

$PSQL -c "delete from products where category_id='$CAT'; delete from categories where id='$CAT'" >/dev/null
echo "RESULT pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
