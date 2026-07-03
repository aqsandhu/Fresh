export type StaticPageId =
  | 'terms'
  | 'privacy'
  | 'faq'
  | 'contact'
  | 'returns'
  | 'shipping';

export interface StaticSection {
  title: string;
  body: string;
}

export interface StaticPageContent {
  title: string;
  subtitle?: string;
  sections: StaticSection[];
}

export const STATIC_PAGES: Record<StaticPageId, StaticPageContent> = {
  terms: {
    title: 'Terms of Service',
    subtitle: 'Last updated: 2024',
    sections: [
      {
        title: 'Orders',
        body:
          'By placing an order on Fresh Bazar, you agree to provide accurate delivery information. Orders can be modified within 30 minutes of placement by contacting support.',
      },
      {
        title: 'Delivery',
        body:
          'We deliver within selected city limits. Delivery charges apply unless your vegetables and fruits subtotal is Rs. 500 or more, or you select a free-delivery time slot at checkout.',
      },
      {
        title: 'Payment',
        body:
          'Cash on Delivery is available. Online payment methods may be offered where supported. All prices are in Pakistani Rupees (PKR).',
      },
      {
        title: 'Returns',
        body:
          'Report damaged or incorrect items within 24 hours of delivery. We will arrange replacement or refund where applicable.',
      },
      {
        title: 'Liability',
        body:
          'Fresh Bazar is not liable for delays caused by factors outside our control including weather, traffic, or incorrect address details provided by the customer.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'Last updated: July 2026',
    sections: [
      {
        title: 'Information We Collect',
        body:
          'We collect your phone number, name, optional email, delivery addresses, order history, device information, and push-notification tokens to provide Fresh Bazar services.',
      },
      {
        title: 'Location Data',
        body:
          'Your location is used only while you are using the app to place your delivery address accurately on the map. The customer app does not collect your location in the background.',
      },
      {
        title: 'Camera & Photos',
        body:
          'You may optionally attach a door or gate photo so the rider can find your address. Photos are used only for the delivery they belong to.',
      },
      {
        title: 'How We Use Information',
        body:
          'Your data is used to process orders, send delivery updates, improve our service, prevent fraud, and communicate promotions if you opt in.',
      },
      {
        title: 'Data Sharing',
        body:
          'We share delivery details with assigned riders only. We do not sell your personal information to third parties.',
      },
      {
        title: 'Account Deletion',
        body:
          'You can delete your account in Profile > Settings > Delete Account, or on the web at freshbazar.pk/delete-account. Name, phone, email, saved addresses, login credentials, and notification tokens are removed immediately.',
      },
      {
        title: 'Data Retention',
        body:
          'Order and payment records may be retained for legal book-keeping, but deleted accounts are anonymized so those records no longer identify you.',
      },
      {
        title: 'Security',
        body:
          'We use industry-standard security measures to protect your account and payment information.',
      },
      {
        title: 'Cookies',
        body:
          'Our website may use cookies for session management and analytics. The mobile app stores preferences locally on your device.',
      },
    ],
  },
  faq: {
    title: 'Frequently Asked Questions',
    subtitle: 'اکثر پوچھے گئے سوالات',
    sections: [
      {
        title: 'How do I place an order?',
        body:
          'Browse products, add items to your cart, select delivery address and time slot, then place your order with Cash on Delivery.',
      },
      {
        title: 'What are delivery charges?',
        body:
          'Delivery is FREE when vegetables + fruits subtotal is Rs. 500 or more, or when you choose a free-delivery slot. Otherwise Rs. 100 applies.',
      },
      {
        title: 'What are delivery time slots?',
        body:
          '10AM-2PM (FREE if ordered before 10AM), 2PM-6PM, and 6PM-9PM.',
      },
      {
        title: 'Can I modify my order?',
        body:
          'Orders can be modified within 30 minutes of placing them. Contact customer support for help.',
      },
      {
        title: 'How do I track my order?',
        body:
          'Go to My Orders and tap Track Order when your order is out for delivery.',
      },
      {
        title: 'How do I create an account?',
        body:
          'Tap Login/Register, verify your phone with OTP, complete your profile, and set a 4-digit PIN.',
      },
    ],
  },
  contact: {
    title: 'Contact Us',
    subtitle: 'We are here to help',
    sections: [
      {
        title: 'Phone',
        body: '0300-1234567 — Available 9AM to 9PM daily.',
      },
      {
        title: 'Email',
        body: 'support@freshbazar.pk — We respond within 24 hours.',
      },
      {
        title: 'WhatsApp',
        body: 'Message us on WhatsApp for quick order support.',
      },
      {
        title: 'Address',
        body: 'Fresh Bazar, Gujrat, Punjab, Pakistan.',
      },
    ],
  },
  returns: {
    title: 'Returns & Refunds',
    sections: [
      {
        title: 'Damaged Items',
        body:
          'If you receive damaged vegetables, fruits, or groceries, report within 24 hours with a photo. We will replace or refund.',
      },
      {
        title: 'Wrong Items',
        body:
          'If you received incorrect items, contact us immediately. We will arrange the correct items or a full refund.',
      },
      {
        title: 'Refund Process',
        body:
          'Approved refunds for online payments are processed within 5-7 business days. COD refunds are adjusted on your next order or via bank transfer.',
      },
    ],
  },
  shipping: {
    title: 'Shipping & Delivery',
    sections: [
      {
        title: 'Delivery Areas',
        body:
          'We currently deliver to all areas within selected city limits. Select your city before browsing products.',
      },
      {
        title: 'Delivery Times',
        body:
          'Same-day delivery available for orders placed before the slot cutoff. Morning slot (10AM-2PM) is free when ordered before 10AM.',
      },
      {
        title: 'Delivery Charges',
        body:
          'Standard delivery charge is Rs. 100. Free delivery applies when vegetables and fruits subtotal reaches Rs. 500 or a free slot is selected.',
      },
    ],
  },
};
