// Item weigh-in (variable weight) — moved from orders.controller.ts (W21: only the place changed, not the behaviour).

import { asCaughtError } from '../../../utils/caughtError';
import { Request, Response } from 'express';
import { withTransaction } from '../../../config/database';
import { asyncHandler } from '../../../middleware';
import { successResponse, notFoundResponse, errorResponse } from '../../../utils/response';
import { emitOrderUpdate, emitToUser } from '../../../config/socket';
import logger from '../../../utils/logger';
import { pushToCustomers } from '../../../utils/customerNotify';
import { resolveCityScope, orderInScope } from '../../../utils/cityScope';
import { notifyActiveRiderOfOrderChange } from '../../../utils/riderTaskEvents';
import { adjustStockForWeightDelta } from '../../../utils/systemStock';
import { roundMoney } from '../../../utils/money';
import { unitStockMultiplier } from '../../../utils/unitPricing';
import { hasVariableWeightColumns, hasQualityCatalogColumns } from '../../../config/productSchema';
import { ensureControlColumns } from '../../../config/controlSchema';
import { couponDiscountForNewSubtotal } from './shared';

/**
 * Adjust the actual packed weight of a variable-weight order item, and
 * recompute that line + the whole order total — all atomically.
 * PUT /api/admin/orders/:id/items/:itemId/weight   Body: { weight_kg }
 */
export const updateOrderItemWeight = asyncHandler(async (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const weight = parseFloat(String(req.body?.weight_kg));
  if (!Number.isFinite(weight) || weight < 0 || weight > 10000) {
    return errorResponse(res, 'Enter a valid weight in kilograms', 400);
  }

  if (!(await hasVariableWeightColumns())) {
    return errorResponse(res, 'Weight adjustment is not available yet.', 503);
  }
  await ensureControlColumns();

  const scope = await resolveCityScope(req);
  if (!(await orderInScope(scope, id))) {
    return notFoundResponse(res, 'Order not found');
  }

  let updatedOrder: any = null;
  try {
    updatedOrder = await withTransaction(async (client) => {
      const orderRes = await client.query(
        `SELECT id, user_id, status, payment_status, subtotal, delivery_charge, discount_amount,
                coupon_discount, coupon_code, tax_amount, city_id
           FROM orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      if (orderRes.rows.length === 0) {
        throw Object.assign(new Error('Order not found'), { http: 404 });
      }
      const order = orderRes.rows[0];
      if (['cancelled', 'refunded'].includes(order.status)) {
        throw Object.assign(
          new Error('Cannot change weight on a cancelled or refunded order'),
          { http: 400 }
        );
      }
      // Once the cash is in (delivered / paid) the total is final — a weight
      // edit would silently desync total_amount from paid_amount.
      if (order.status === 'delivered' || order.payment_status === 'completed') {
        throw Object.assign(
          new Error('Cannot change weight after the order is delivered or paid'),
          { http: 400 }
        );
      }

      const qualityCol = (await hasQualityCatalogColumns()) ? ', oi.quality' : '';
      const itemRes = await client.query(
        `SELECT oi.id, oi.unit_price, oi.product_id, oi.product_name, oi.quantity, oi.unit,
                oi.weight_kg AS prev_weight, oi.total_price AS prev_total,
                COALESCE(p.unit_value, 1) AS unit_value,
                COALESCE(p.is_variable_weight, FALSE) AS is_variable_weight
                ${qualityCol}
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
          WHERE oi.id = $1 AND oi.order_id = $2
          FOR UPDATE OF oi`,
        [itemId, id]
      );
      if (itemRes.rows.length === 0) {
        throw Object.assign(new Error('Order item not found'), { http: 404 });
      }
      const item = itemRes.rows[0];
      if (!item.is_variable_weight) {
        throw Object.assign(
          new Error('This item is not sold by variable weight'),
          { http: 400 }
        );
      }

      // Price per kg = the line's unit price ÷ the weight ONE sale-unit stands
      // for. A "half kg" line is priced per half kg, so its sale-unit weighs
      // unit_value × 0.5 — dividing by unit_value alone (as before) halved
      // the bill of every half-kg line that was weighed. Never client-supplied.
      const unitValue = parseFloat(item.unit_value) || 1;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const saleUnitKg = unitValue * unitStockMultiplier(item.unit);
      const pricePerKg = saleUnitKg > 0 ? unitPrice / saleUnitKg : unitPrice;
      const newTotal = roundMoney(pricePerKg * weight);
      // What the line was assumed to weigh when it was ordered. Orders store
      // no weight at placement, so the FIRST weigh-in compares with this
      // estimate — otherwise the extra (or missing) weight never reached stock.
      const estimatedKg = (parseFloat(item.quantity) || 1) * saleUnitKg;

      await client.query(
        `UPDATE order_items
            SET final_weight_kg = $1, weight_kg = $1, total_price = $2, updated_at = NOW()
          WHERE id = $3`,
        [weight, newTotal, itemId]
      );

      // Physical stock must match COGS: the reservation/sale consumed the
      // ESTIMATED weight; reconcile the (actual − estimated) delta against
      // on-hand now. Incremental per edit (prev recorded weight → new), so
      // repeated weigh-ins never double-apply.
      const storedWeight = parseFloat(item.prev_weight);
      const prevWeightNum = Number.isFinite(storedWeight) ? storedWeight : estimatedKg;
      if (item.product_id && unitValue > 0 && weight !== prevWeightNum) {
        await adjustStockForWeightDelta(client, {
          productId: item.product_id,
          quality: item.quality ?? 'A',
          deltaUnits: (weight - prevWeightNum) / unitValue,
          orderId: id,
          cityId: order.city_id ?? null,
          createdBy: req.user?.id ?? null,
        });
      }

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(total_price), 0) AS subtotal FROM order_items WHERE order_id = $1`,
        [id]
      );
      const subtotal = roundMoney(parseFloat(sumRes.rows[0].subtotal) || 0);
      const delivery = parseFloat(order.delivery_charge) || 0;
      const discount = parseFloat(order.discount_amount) || 0;
      const tax = parseFloat(order.tax_amount) || 0;
      // The coupon is worked out again on the NEW subtotal. Re-using the
      // amount from checkout made the order free: Rs 1000 of goods with a
      // 50 % coupon (Rs 500 off), weighed down to Rs 200, still took Rs 500
      // off — total Rs 0.
      const coupon = await couponDiscountForNewSubtotal(client, {
        orderId: id,
        couponCode: order.coupon_code,
        oldDiscount: parseFloat(order.coupon_discount) || 0,
        oldSubtotal: parseFloat(order.subtotal) || 0,
        newSubtotal: subtotal,
      });
      const total = roundMoney(Math.max(0, subtotal + delivery - discount - coupon + tax));

      const upd = await client.query(
        `UPDATE orders SET subtotal = $1, total_amount = $2, coupon_discount = $4, updated_at = NOW()
          WHERE id = $3 RETURNING *`,
        [subtotal, total, id, coupon]
      );

      // Audit EVERY weight edit (old→new + value delta). No single edit is
      // suspicious; the per-editor cumulative upward bias is what the owner's
      // daily reconciliation flags — this is the data it reads.
      const prevWeight = prevWeightNum; // the stored weight, or the ordered estimate on the first weigh-in
      const prevTotal = parseFloat(item.prev_total) || 0;
      await client.query(
        `INSERT INTO order_item_weight_edits
           (order_id, order_item_id, product_id, edited_by, old_weight, new_weight, delta, old_total, new_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id, itemId, item.product_id ?? null, req.user?.id ?? null,
          Number.isFinite(prevWeight) ? prevWeight : null, weight,
          Number.isFinite(prevWeight) ? roundMoney(weight - prevWeight) : null,
          prevTotal, newTotal,
        ]
      );

      // Tell the customer their bill changed, with the exact packed weight — the
      // customer who receives the goods is the real-world check on the weight.
      // Persisted (bell) + realtime, so they see it even if offline at the time.
      const dirWord = newTotal > prevTotal ? 'barh kar' : newTotal < prevTotal ? 'kam ho kar' : 'update ho kar';
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, order_id)
         VALUES ($1, 'order_amount_updated', $2, $3, $4)`,
        [
          order.user_id,
          'Order total updated',
          `${item.product_name || 'Item'} ka weight ${weight} kg hua. Aapke order ka naya total Rs. ${total} ${dirWord} hai.`,
          id,
        ]
      );

      return { ...upd.rows[0], _prevTotal: prevTotal, _newTotal: newTotal };
    });
  } catch (errCaught: unknown) {
    const err = asCaughtError(errCaught);
    if (err?.http === 404) return notFoundResponse(res, err.message);
    if (err?.http === 400) return errorResponse(res, err.message, 400);
    throw err;
  }

  logger.info('Order item weight updated', {
    orderId: id, itemId, weight, updatedBy: req.user?.id,
    oldTotal: updatedOrder._prevTotal, newTotal: updatedOrder._newTotal,
  });
  emitOrderUpdate(id, {
    orderId: id,
    totalAmount: parseFloat(updatedOrder.total_amount),
    message: 'Order amount updated after weighing',
  });
  emitToUser(updatedOrder.user_id, 'order:amount_updated', {
    orderId: id,
    totalAmount: parseFloat(updatedOrder.total_amount),
    message: 'Your order amount was updated after weighing the items.',
  });
  // The inbox row was written inside the transaction; push it too so a
  // customer with the app closed learns the new COD amount before the rider.
  pushToCustomers([updatedOrder.user_id], {
    title: 'Order total updated',
    body: `Order #${updatedOrder.order_number}: new total Rs. ${parseFloat(updatedOrder.total_amount)} after weighing.`,
    data: { type: 'order_amount_updated', orderId: id, orderNumber: updatedOrder.order_number },
  }).catch(() => {});
  // The rider carrying it must collect the NEW amount.
  const newTotal = parseFloat(updatedOrder.total_amount);
  notifyActiveRiderOfOrderChange(id, {
    message: `Order #${updatedOrder.order_number} amount changed to Rs ${newTotal}`,
    push: {
      title: 'Order amount changed',
      body: `Order #${updatedOrder.order_number}: collect Rs ${newTotal} (items re-weighed).`,
    },
    data: { totalAmount: newTotal },
  }).catch(() => {});
  successResponse(res, updatedOrder, 'Weight and amount updated');
});

/**
 * Toggle customer phone visibility on order
 * PUT /api/admin/orders/:id/toggle-phone
 */
