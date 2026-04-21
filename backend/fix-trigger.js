const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'grocery_db',
  user: 'postgres',
  password: 'Aq@146776',
});

async function fix() {
  const sql = `
    CREATE OR REPLACE FUNCTION notify_order_status_change()
    RETURNS TRIGGER AS $$
    DECLARE
        v_notification_title VARCHAR(255);
        v_notification_message TEXT;
        v_notification_type notification_type;
    BEGIN
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

        -- Insert notification for customer (NEW.user_id IS the user id from orders table)
        INSERT INTO notifications (user_id, type, title, message, order_id)
        VALUES (NEW.user_id, v_notification_type, v_notification_title, v_notification_message, NEW.id);

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  await pool.query(sql);
  console.log('Trigger function fixed successfully!');
  await pool.end();
}

fix().catch((e) => {
  console.error('Error:', e.message);
  pool.end();
});
