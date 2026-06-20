-- ============================================================================
-- Migration 39 - Make order status notifications compatible with restaurant
-- orders.
--
-- Restaurant/B2B orders share the orders table but intentionally have no
-- consumer user_id. The old trigger tried to insert notifications.user_id =
-- NULL for those rows, violating chk_notifications_recipient and rolling back
-- the status update. Consumer notifications remain unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_notification_title VARCHAR(255);
    v_notification_message TEXT;
    v_notification_type notification_type;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    CASE NEW.status
        WHEN 'confirmed' THEN
            v_notification_title := 'Order Confirmed';
            v_notification_message := 'Your order ' || NEW.order_number || ' has been confirmed!';
            v_notification_type := 'order_confirmed';
        WHEN 'preparing' THEN
            v_notification_title := 'Order Being Prepared';
            v_notification_message := 'We are preparing your order ' || NEW.order_number;
            v_notification_type := 'order_confirmed';
        WHEN 'out_for_delivery' THEN
            v_notification_title := 'Out for Delivery';
            v_notification_message := 'Your order ' || NEW.order_number || ' is on the way!';
            v_notification_type := 'out_for_delivery';
        WHEN 'delivered' THEN
            v_notification_title := 'Order Delivered';
            v_notification_message := 'Your order ' || NEW.order_number || ' has been delivered. Enjoy!';
            v_notification_type := 'delivered';
        WHEN 'cancelled' THEN
            v_notification_title := 'Order Cancelled';
            v_notification_message := 'Your order ' || NEW.order_number || ' has been cancelled.';
            v_notification_type := 'cancelled';
        ELSE
            RETURN NEW;
    END CASE;

    IF NEW.user_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO notifications (user_id, type, title, message, order_id)
    VALUES (NEW.user_id, v_notification_type, v_notification_title, v_notification_message, NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
