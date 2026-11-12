
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "announcements": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"event_id": string,"id": string,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"event_id": string,"id"?: string,"kind"?: string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"event_id"?: string,"id"?: string,"kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_events": {
                  Row: {
                    "collection_id": string,"event_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "collection_id": string,"event_id": string,"position"?: number
                  }
                  Update: {
                    "collection_id"?: string,"event_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_events_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_events_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"position": number,"slug": string,"subtitle": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"position"?: number,"slug": string,"subtitle"?: string,"title": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"position"?: number,"slug"?: string,"subtitle"?: string,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"event_addons": {
                  Row: {
                    "capacity": number,"departs_at": string | null,"description": string,"event_id": string,"id": string,"kind": string,"name": string,"position": number,"price": number,"sold": number
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity": number,"departs_at"?: string | null,"description"?: string,"event_id": string,"id"?: string,"kind"?: string,"name": string,"position"?: number,"price": number,"sold"?: number
                  }
                  Update: {
                    "capacity"?: number,"departs_at"?: string | null,"description"?: string,"event_id"?: string,"id"?: string,"kind"?: string,"name"?: string,"position"?: number,"price"?: number,"sold"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_addons_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_staff": {
                  Row: {
                    "added_at": string,"email": string,"event_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"email": string,"event_id": string
                  }
                  Update: {
                    "added_at"?: string,"email"?: string,"event_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_staff_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "access": string | null,"auto_approved": boolean,"category": Database["public"]['Enums']["event_category"],"created_at": string,"currency": string,"description": string,"edited_after_review": boolean,"ends_at": string,"fee_mode": string,"id": string,"image_path": string | null,"image_url": string | null,"lat": number,"lineup": (string)[],"listing": Database["public"]['Enums']["listing_status"],"lng": number,"notice": string | null,"organizer_id": string | null,"organizer_name": string,"owner_id": string | null,"payout_hold": boolean,"public_sale_at": string | null,"review_flags": (string)[],"review_note": string | null,"reviewed_at": string | null,"series_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["event_status"],"title": string,"venue_address": string,"venue_area": string,"venue_id": string | null,"venue_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access"?: string | null,"auto_approved"?: boolean,"category": Database["public"]['Enums']["event_category"],"created_at"?: string,"currency"?: string,"description": string,"edited_after_review"?: boolean,"ends_at": string,"fee_mode"?: string,"id": string,"image_path"?: string | null,"image_url"?: string | null,"lat": number,"lineup"?: (string)[],"listing"?: Database["public"]['Enums']["listing_status"],"lng": number,"notice"?: string | null,"organizer_id"?: string | null,"organizer_name": string,"owner_id"?: string | null,"payout_hold"?: boolean,"public_sale_at"?: string | null,"review_flags"?: (string)[],"review_note"?: string | null,"reviewed_at"?: string | null,"series_id"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["event_status"],"title": string,"venue_address": string,"venue_area": string,"venue_id"?: string | null,"venue_name": string
                  }
                  Update: {
                    "access"?: string | null,"auto_approved"?: boolean,"category"?: Database["public"]['Enums']["event_category"],"created_at"?: string,"currency"?: string,"description"?: string,"edited_after_review"?: boolean,"ends_at"?: string,"fee_mode"?: string,"id"?: string,"image_path"?: string | null,"image_url"?: string | null,"lat"?: number,"lineup"?: (string)[],"listing"?: Database["public"]['Enums']["listing_status"],"lng"?: number,"notice"?: string | null,"organizer_id"?: string | null,"organizer_name"?: string,"owner_id"?: string | null,"payout_hold"?: boolean,"public_sale_at"?: string | null,"review_flags"?: (string)[],"review_note"?: string | null,"reviewed_at"?: string | null,"series_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["event_status"],"title"?: string,"venue_address"?: string,"venue_area"?: string,"venue_id"?: string | null,"venue_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: false
      referencedRelation: "organizers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"organizer_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organizer_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organizer_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: false
      referencedRelation: "organizers"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger": {
                  Row: {
                    "amount": number,"available_at": string,"created_at": string,"currency": string,"event_id": string | null,"id": number,"kind": string,"memo": string,"payment_id": string | null,"payout_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"available_at": string,"created_at"?: string,"currency"?: string,"event_id"?: string | null,"id"?: never,"kind": string,"memo"?: string,"payment_id"?: string | null,"payout_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"available_at"?: string,"created_at"?: string,"currency"?: string,"event_id"?: string | null,"id"?: never,"kind"?: string,"memo"?: string,"payment_id"?: string | null,"payout_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_payout_fk"
      columns: ["payout_id"]
isOneToOne: false
      referencedRelation: "payouts"
      referencedColumns: ["id"]
    }
                  ]
                },"member_passes": {
                  Row: {
                    "cancelled_at": string | null,"created_at": string,"expires_at": string,"id": string,"membership_id": string,"organizer_id": string,"payment_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"membership_id": string,"organizer_id": string,"payment_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"membership_id"?: string,"organizer_id"?: string,"payment_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_passes_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_passes_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: false
      referencedRelation: "organizers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "member_passes_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "active": boolean,"created_at": string,"discount_pct": number,"id": string,"name": string,"organizer_id": string,"period": string,"perks": string,"price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"discount_pct"?: number,"id"?: string,"name": string,"organizer_id": string,"period"?: string,"perks"?: string,"price": number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"discount_pct"?: number,"id"?: string,"name"?: string,"organizer_id"?: string,"period"?: string,"perks"?: string,"price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: true
      referencedRelation: "organizers"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"kind": string,"link": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_addons": {
                  Row: {
                    "addon_id": string,"order_id": string,"quantity": number,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "addon_id": string,"order_id": string,"quantity": number,"unit_price": number
                  }
                  Update: {
                    "addon_id"?: string,"order_id"?: string,"quantity"?: number,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_addons_addon_id_fkey"
      columns: ["addon_id"]
isOneToOne: false
      referencedRelation: "event_addons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_addons_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_lines": {
                  Row: {
                    "order_id": string,"quantity": number,"tier_id": string,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "order_id": string,"quantity": number,"tier_id": string,"unit_price": number
                  }
                  Update: {
                    "order_id"?: string,"quantity"?: number,"tier_id"?: string,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_lines_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_lines_tier_id_fkey"
      columns: ["tier_id"]
isOneToOne: false
      referencedRelation: "tiers"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "addons_total": number,"commission": number,"created_at": string,"discount": number,"email": string,"event_id": string,"fee": number,"fee_mode": string,"gift_email": string | null,"gift_name": string | null,"holder_name": string,"id": string,"organiser_net": number,"payment_id": string | null,"promo_id": string | null,"promoter_link_id": string | null,"status": string,"subtotal": number,"total": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "addons_total"?: number,"commission"?: number,"created_at"?: string,"discount"?: number,"email": string,"event_id": string,"fee"?: number,"fee_mode"?: string,"gift_email"?: string | null,"gift_name"?: string | null,"holder_name": string,"id"?: string,"organiser_net"?: number,"payment_id"?: string | null,"promo_id"?: string | null,"promoter_link_id"?: string | null,"status": string,"subtotal"?: number,"total": number,"user_id"?: string | null
                  }
                  Update: {
                    "addons_total"?: number,"commission"?: number,"created_at"?: string,"discount"?: number,"email"?: string,"event_id"?: string,"fee"?: number,"fee_mode"?: string,"gift_email"?: string | null,"gift_name"?: string | null,"holder_name"?: string,"id"?: string,"organiser_net"?: number,"payment_id"?: string | null,"promo_id"?: string | null,"promoter_link_id"?: string | null,"status"?: string,"subtotal"?: number,"total"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_payment_fk"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "promo_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_promoter_link_id_fkey"
      columns: ["promoter_link_id"]
isOneToOne: false
      referencedRelation: "promoter_links"
      referencedColumns: ["id"]
    }
                  ]
                },"organizer_reviews": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"event_id": string,"id": string,"organizer_id": string,"rating": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name": string,"body"?: string,"created_at"?: string,"event_id": string,"id"?: string,"organizer_id": string,"rating": number,"user_id"?: string | null
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"event_id"?: string,"id"?: string,"organizer_id"?: string,"rating"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizer_reviews_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organizer_reviews_organizer_id_fkey"
      columns: ["organizer_id"]
isOneToOne: false
      referencedRelation: "organizers"
      referencedColumns: ["id"]
    }
                  ]
                },"organizers": {
                  Row: {
                    "avatar_path": string | null,"banner_path": string | null,"bio": string,"created_at": string,"id": string,"name": string,"owner_id": string,"slug": string,"verified": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string,"created_at"?: string,"id"?: string,"name": string,"owner_id": string,"slug": string,"verified"?: boolean
                  }
                  Update: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string,"created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"slug"?: string,"verified"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"bank_ref": string | null,"booking_id": string | null,"confirmed_by": string | null,"created_at": string,"currency": string,"expires_at": string,"fee": number,"id": string,"label": string,"membership_id": string | null,"meta": NonNullable<Json>,"method": string | null,"note": string,"order_id": string | null,"paid_at": string | null,"payer_id": string | null,"promotion_id": string | null,"provider": string | null,"provider_ref": string | null,"purpose": string,"reference": string,"refunded_at": string | null,"resale_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"bank_ref"?: string | null,"booking_id"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"currency"?: string,"expires_at": string,"fee"?: number,"id"?: string,"label": string,"membership_id"?: string | null,"meta"?: NonNullable<Json>,"method"?: string | null,"note"?: string,"order_id"?: string | null,"paid_at"?: string | null,"payer_id"?: string | null,"promotion_id"?: string | null,"provider"?: string | null,"provider_ref"?: string | null,"purpose": string,"reference": string,"refunded_at"?: string | null,"resale_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "amount"?: number,"bank_ref"?: string | null,"booking_id"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"currency"?: string,"expires_at"?: string,"fee"?: number,"id"?: string,"label"?: string,"membership_id"?: string | null,"meta"?: NonNullable<Json>,"method"?: string | null,"note"?: string,"order_id"?: string | null,"paid_at"?: string | null,"payer_id"?: string | null,"promotion_id"?: string | null,"provider"?: string | null,"provider_ref"?: string | null,"purpose"?: string,"reference"?: string,"refunded_at"?: string | null,"resale_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "venue_bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_promotion_id_fkey"
      columns: ["promotion_id"]
isOneToOne: false
      referencedRelation: "promotions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_resale_id_fkey"
      columns: ["resale_id"]
isOneToOne: false
      referencedRelation: "resale_listings"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "account_name": string,"account_number": string,"bank": string,"changed_at": string,"usd_account_number": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_name": string,"account_number": string,"bank": string,"changed_at"?: string,"usd_account_number"?: string | null,"user_id": string
                  }
                  Update: {
                    "account_name"?: string,"account_number"?: string,"bank"?: string,"changed_at"?: string,"usd_account_number"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payouts": {
                  Row: {
                    "account": NonNullable<Json>,"amount": number,"bank_ref": string | null,"created_at": string,"currency": string,"decided_at": string | null,"flags": (string)[],"id": string,"note": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account": NonNullable<Json>,"amount": number,"bank_ref"?: string | null,"created_at"?: string,"currency"?: string,"decided_at"?: string | null,"flags"?: (string)[],"id"?: string,"note"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "account"?: NonNullable<Json>,"amount"?: number,"bank_ref"?: string | null,"created_at"?: string,"currency"?: string,"decided_at"?: string | null,"flags"?: (string)[],"id"?: string,"note"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"banner_path": string | null,"created_at": string,"display_name": string,"id": string,"pro_until": string | null,"suspended_at": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"created_at"?: string,"display_name"?: string,"id": string,"pro_until"?: string | null,"suspended_at"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"pro_until"?: string | null,"suspended_at"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"promo_codes": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"event_id": string,"id": string,"max_uses": number | null,"percent_off": number,"used": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"event_id": string,"id"?: string,"max_uses"?: number | null,"percent_off": number,"used"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"event_id"?: string,"id"?: string,"max_uses"?: number | null,"percent_off"?: number,"used"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_codes_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"promoter_links": {
                  Row: {
                    "active": boolean,"code": string,"commission_pct": number,"created_at": string,"email": string | null,"event_id": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"commission_pct"?: number,"created_at"?: string,"email"?: string | null,"event_id": string,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"commission_pct"?: number,"created_at"?: string,"email"?: string | null,"event_id"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promoter_links_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"promotions": {
                  Row: {
                    "amount": number,"created_at": string,"days": number,"ends_at": string | null,"event_id": string,"id": string,"owner_id": string | null,"payment_id": string | null,"starts_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"days": number,"ends_at"?: string | null,"event_id": string,"id"?: string,"owner_id"?: string | null,"payment_id"?: string | null,"starts_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"days"?: number,"ends_at"?: string | null,"event_id"?: string,"id"?: string,"owner_id"?: string | null,"payment_id"?: string | null,"starts_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promotions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promotions_payment_fk"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "created_at": string,"details": string,"id": string,"reason": string,"reporter_id": string | null,"resolution_note": string,"resolved_at": string | null,"resolved_by": string | null,"status": string,"subject_id": string | null,"target_id": string,"target_kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"details"?: string,"id"?: string,"reason": string,"reporter_id"?: string | null,"resolution_note"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"subject_id"?: string | null,"target_id": string,"target_kind": string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string,"id"?: string,"reason"?: string,"reporter_id"?: string | null,"resolution_note"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"subject_id"?: string | null,"target_id"?: string,"target_kind"?: string
                  }
                  Relationships: [
                    
                  ]
                },"resale_listings": {
                  Row: {
                    "buyer_id": string | null,"buyer_name": string | null,"created_at": string,"event_id": string,"id": string,"payment_id": string | null,"price": number,"seller_id": string | null,"sold_at": string | null,"status": string,"ticket_id": string,"tier_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_id"?: string | null,"buyer_name"?: string | null,"created_at"?: string,"event_id": string,"id"?: string,"payment_id"?: string | null,"price": number,"seller_id"?: string | null,"sold_at"?: string | null,"status"?: string,"ticket_id": string,"tier_id": string
                  }
                  Update: {
                    "buyer_id"?: string | null,"buyer_name"?: string | null,"created_at"?: string,"event_id"?: string,"id"?: string,"payment_id"?: string | null,"price"?: number,"seller_id"?: string | null,"sold_at"?: string | null,"status"?: string,"ticket_id"?: string,"tier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resale_listings_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resale_listings_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resale_listings_tier_id_fkey"
      columns: ["tier_id"]
isOneToOne: false
      referencedRelation: "tiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "resale_payment_fk"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_events": {
                  Row: {
                    "created_at": string,"event_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_events_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"seats": {
                  Row: {
                    "event_id": string,"id": string,"kind": string,"number": number,"order_id": string | null,"position": number,"row_label": string,"section": string,"status": string,"ticket_id": string | null,"tier_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"id"?: string,"kind"?: string,"number": number,"order_id"?: string | null,"position"?: number,"row_label": string,"section": string,"status"?: string,"ticket_id"?: string | null,"tier_id": string
                  }
                  Update: {
                    "event_id"?: string,"id"?: string,"kind"?: string,"number"?: number,"order_id"?: string | null,"position"?: number,"row_label"?: string,"section"?: string,"status"?: string,"ticket_id"?: string | null,"tier_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seats_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seats_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seats_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seats_tier_id_fkey"
      columns: ["tier_id"]
isOneToOne: false
      referencedRelation: "tiers"
      referencedColumns: ["id"]
    }
                  ]
                },"tickets": {
                  Row: {
                    "checked_in_at": string | null,"checked_in_by": string | null,"claim_email": string | null,"code": string,"event_id": string,"holder_name": string,"id": string,"listed_for_resale": boolean,"order_id": string,"owner_id": string | null,"purchased_at": string,"refund_requested_at": string | null,"seat_id": string | null,"seat_label": string | null,"tier_id": string,"transferred_at": string | null,"transferred_from": string | null,"transferred_to_email": string | null,"transferred_to_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_in_at"?: string | null,"checked_in_by"?: string | null,"claim_email"?: string | null,"code": string,"event_id": string,"holder_name": string,"id"?: string,"listed_for_resale"?: boolean,"order_id": string,"owner_id"?: string | null,"purchased_at"?: string,"refund_requested_at"?: string | null,"seat_id"?: string | null,"seat_label"?: string | null,"tier_id": string,"transferred_at"?: string | null,"transferred_from"?: string | null,"transferred_to_email"?: string | null,"transferred_to_name"?: string | null
                  }
                  Update: {
                    "checked_in_at"?: string | null,"checked_in_by"?: string | null,"claim_email"?: string | null,"code"?: string,"event_id"?: string,"holder_name"?: string,"id"?: string,"listed_for_resale"?: boolean,"order_id"?: string,"owner_id"?: string | null,"purchased_at"?: string,"refund_requested_at"?: string | null,"seat_id"?: string | null,"seat_label"?: string | null,"tier_id"?: string,"transferred_at"?: string | null,"transferred_from"?: string | null,"transferred_to_email"?: string | null,"transferred_to_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_seat_fk"
      columns: ["seat_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_tier_id_fkey"
      columns: ["tier_id"]
isOneToOne: false
      referencedRelation: "tiers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tickets_transferred_from_fkey"
      columns: ["transferred_from"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"tiers": {
                  Row: {
                    "capacity": number,"description": string,"event_id": string,"id": string,"name": string,"position": number,"price": number,"seated": boolean,"sold": number
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity": number,"description"?: string,"event_id": string,"id"?: string,"name": string,"position"?: number,"price": number,"seated"?: boolean,"sold"?: number
                  }
                  Update: {
                    "capacity"?: number,"description"?: string,"event_id"?: string,"id"?: string,"name"?: string,"position"?: number,"price"?: number,"seated"?: boolean,"sold"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tiers_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_bookings": {
                  Row: {
                    "cancelled_by": string | null,"created_at": string,"decided_at": string | null,"during": unknown,"ends_at": string,"event_id": string | null,"id": string,"message": string,"own_use": boolean,"owner_email": string | null,"paid_at": string | null,"payment_id": string | null,"reply": string,"requester_email": string,"requester_id": string,"requester_name": string,"starts_at": string,"status": Database["public"]['Enums']["booking_status"],"total": number,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"during"?: never,"ends_at": string,"event_id"?: string | null,"id"?: string,"message"?: string,"own_use"?: boolean,"owner_email"?: string | null,"paid_at"?: string | null,"payment_id"?: string | null,"reply"?: string,"requester_email": string,"requester_id": string,"requester_name": string,"starts_at": string,"status"?: Database["public"]['Enums']["booking_status"],"total": number,"venue_id": string
                  }
                  Update: {
                    "cancelled_by"?: string | null,"created_at"?: string,"decided_at"?: string | null,"during"?: never,"ends_at"?: string,"event_id"?: string | null,"id"?: string,"message"?: string,"own_use"?: boolean,"owner_email"?: string | null,"paid_at"?: string | null,"payment_id"?: string | null,"reply"?: string,"requester_email"?: string,"requester_id"?: string,"requester_name"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["booking_status"],"total"?: number,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_payment_fk"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_bookings_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_bookings_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_reviews": {
                  Row: {
                    "author_id": string | null,"author_name": string,"body": string,"booking_id": string,"created_at": string,"id": string,"rating": number,"replied_at": string | null,"reply": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"author_name": string,"body"?: string,"booking_id": string,"created_at"?: string,"id"?: string,"rating": number,"replied_at"?: string | null,"reply"?: string,"venue_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"author_name"?: string,"body"?: string,"booking_id"?: string,"created_at"?: string,"id"?: string,"rating"?: number,"replied_at"?: string | null,"reply"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_reviews_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "venue_bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_reviews_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "access": string | null,"address": string,"amenities": (string)[],"archived": boolean,"area": string,"capacity": number,"created_at": string,"description": string,"for_rent": boolean,"hourly_rate": number | null,"id": string,"image_path": string | null,"image_url": string | null,"lat": number,"lng": number,"min_hours": number,"name": string,"owner_id": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "access"?: string | null,"address": string,"amenities"?: (string)[],"archived"?: boolean,"area": string,"capacity": number,"created_at"?: string,"description"?: string,"for_rent"?: boolean,"hourly_rate"?: number | null,"id"?: string,"image_path"?: string | null,"image_url"?: string | null,"lat"?: number,"lng"?: number,"min_hours"?: number,"name": string,"owner_id": string,"verified_at"?: string | null
                  }
                  Update: {
                    "access"?: string | null,"address"?: string,"amenities"?: (string)[],"archived"?: boolean,"area"?: string,"capacity"?: number,"created_at"?: string,"description"?: string,"for_rent"?: boolean,"hourly_rate"?: number | null,"id"?: string,"image_path"?: string | null,"image_url"?: string | null,"lat"?: number,"lng"?: number,"min_hours"?: number,"name"?: string,"owner_id"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"verifications": {
                  Row: {
                    "business_name": string | null,"created_at": string,"document_path": string | null,"id": string,"id_kind": string | null,"id_number": string | null,"kind": string,"lat": number | null,"legal_name": string,"lng": number | null,"note": string,"phone": string | null,"proof_path": string | null,"review_note": string,"reviewed_at": string | null,"reviewed_by": string | null,"selfie_path": string | null,"status": string,"user_id": string,"venue_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_name"?: string | null,"created_at"?: string,"document_path"?: string | null,"id"?: string,"id_kind"?: string | null,"id_number"?: string | null,"kind": string,"lat"?: number | null,"legal_name": string,"lng"?: number | null,"note"?: string,"phone"?: string | null,"proof_path"?: string | null,"review_note"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_path"?: string | null,"status"?: string,"user_id": string,"venue_id"?: string | null
                  }
                  Update: {
                    "business_name"?: string | null,"created_at"?: string,"document_path"?: string | null,"id"?: string,"id_kind"?: string | null,"id_number"?: string | null,"kind"?: string,"lat"?: number | null,"legal_name"?: string,"lng"?: number | null,"note"?: string,"phone"?: string | null,"proof_path"?: string | null,"review_note"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"selfie_path"?: string | null,"status"?: string,"user_id"?: string,"venue_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "verifications_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist": {
                  Row: {
                    "created_at": string,"event_id": string,"notified_at": string | null,"tier_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"notified_at"?: string | null,"tier_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"notified_at"?: string | null,"tier_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waitlist_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_tier_id_fkey"
      columns: ["tier_id"]
isOneToOne: false
      referencedRelation: "tiers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "active_promotions":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"add_event_staff":
{ Args: { "p_email": string,"p_event_id": string }; Returns: undefined
                           },
"addon_manifest":
{ Args: { "p_event_id": string }; Returns: {
              "addon_id": string,"addon_name": string,"holder_name": string,"quantity": number
            }[]
                           },
"admin_confirm_transfer":
{ Args: { "p_bank_ref": string,"p_payment_id": string }; Returns: string
                           },
"admin_decide_payout":
{ Args: { "p_id": string,"p_paid": boolean,"p_ref": string }; Returns: undefined
                           },
"admin_delete_collection":
{ Args: { "p_id": string }; Returns: undefined
                           },
"admin_mark_refunded":
{ Args: { "p_note": string,"p_payment_id": string }; Returns: undefined
                           },
"admin_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_resolve_report":
{ Args: { "p_id": string,"p_note": string,"p_upheld": boolean }; Returns: undefined
                           },
"admin_review_event":
{ Args: { "p_approve": boolean,"p_id": string,"p_note": string }; Returns: undefined
                           },
"admin_review_verification":
{ Args: { "p_approve": boolean,"p_id": string,"p_note": string }; Returns: undefined
                           },
"admin_save_collection":
{ Args: { "p": Json }; Returns: string
                           },
"admin_set_payout_hold":
{ Args: { "p_event_id": string,"p_hold": boolean }; Returns: undefined
                           },
"admin_suspend":
{ Args: { "p_note": string,"p_suspend": boolean,"p_user": string }; Returns: undefined
                           },
"admin_takedown_event":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"admin_user":
{ Args: { "p_user": string }; Returns: Json
                           },
"archive_venue":
{ Args: { "p_venue_id": string }; Returns: undefined
                           },
"broadcast":
{ Args: { "p_body": string,"p_event_id"?: string,"p_organizer_id": string,"p_title": string }; Returns: number
                           },
"browse_organizers":
{ Args: { "p_limit"?: number,"p_query"?: string }; Returns: {
              "avatar_path": string,"banner_path": string,"bio": string,"followers": number,"id": string,"name": string,"rating": number,"slug": string,"upcoming": number,"verified": boolean
            }[]
                           },
"buy_membership":
{ Args: { "p_membership_id": string }; Returns: string
                           },
"buy_pro":
{ Args: { "p_months": number }; Returns: string
                           },
"buy_promotion":
{ Args: { "p_days": number,"p_event_id": string }; Returns: string
                           },
"buy_resale":
{ Args: { "p_holder_name": string,"p_id": string }; Returns: string
                           },
"cancel_booking":
{ Args: { "p_booking_id": string }; Returns: undefined
                           },
"cancel_event":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"cancel_membership":
{ Args: { "p_organizer_id": string }; Returns: Json
                           },
"cancel_payment":
{ Args: { "p_payment_id": string }; Returns: undefined
                           },
"cancel_resale":
{ Args: { "p_id": string }; Returns: undefined
                           },
"check_in":
{ Args: { "p_code": string }; Returns: Json
                           },
"check_promo":
{ Args: { "p_code": string,"p_event_id": string }; Returns: Json
                           },
"choose_payment_method":
{ Args: { "p_method": string,"p_payment_id": string }; Returns: Json
                           },
"claim_tickets":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"clear_seating":
{ Args: { "p_event_id": string,"p_tier_id": string }; Returns: undefined
                           },
"create_event":
{ Args: { "p": Json }; Returns: string
                           },
"create_promo":
{ Args: { "p_code": string,"p_event_id": string,"p_max_uses"?: number,"p_percent": number }; Returns: string
                           },
"delete_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"event_sales":
{ Args: { "p_event_id": string }; Returns: Json
                           },
"gateway_settle":
{ Args: { "p_amount": number,"p_payment_id": string,"p_provider": string,"p_provider_ref": string }; Returns: string
                           },
"list_resale":
{ Args: { "p_code": string,"p_price": number }; Returns: string
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: undefined
                           },
"membership_exit_terms":
{ Args: { "p_organizer_id": string }; Returns: Json
                           },
"mock_gateway_complete":
{ Args: { "p_payment_id": string,"p_success": boolean }; Returns: string
                           },
"my_event_revenue":
{ Args: Record<PropertyKey, never>; Returns: {
              "discounts": number,"event_id": string,"revenue": number
            }[]
                           },
"my_memberships":
{ Args: Record<PropertyKey, never>; Returns: {
              "expires_at": string,"organizer_id": string
            }[]
                           },
"my_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_ticket_secrets":
{ Args: Record<PropertyKey, never>; Returns: {
              "code": string,"secret": string
            }[]
                           },
"my_wallet":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"organizer_stats":
{ Args: { "p_id": string }; Returns: Json
                           },
"payment_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"payment_status":
{ Args: { "p_payment_id": string }; Returns: Json
                           },
"post_announcement":
{ Args: { "p_body": string,"p_event_id": string }; Returns: string
                           },
"purchase":
{ Args: { "p_addons"?: Json,"p_event_id": string,"p_gift"?: Json,"p_holder_name": string,"p_lines": Json,"p_promo"?: string,"p_ref"?: string,"p_seats"?: (string)[] }; Returns: string
                           },
"remove_event_staff":
{ Args: { "p_email": string,"p_event_id": string }; Returns: undefined
                           },
"reply_review":
{ Args: { "p_reply": string,"p_review_id": string }; Returns: undefined
                           },
"report":
{ Args: { "p_details": string,"p_id": string,"p_kind": string,"p_reason": string }; Returns: string
                           },
"request_booking":
{ Args: { "p_hours": number,"p_message": string,"p_name": string,"p_starts_at": string,"p_venue_id": string }; Returns: string
                           },
"request_payout":
{ Args: { "p_currency"?: string }; Returns: string
                           },
"request_refund":
{ Args: { "p_code": string }; Returns: undefined
                           },
"resale_offers":
{ Args: { "p_event_id": string }; Returns: {
              "face_price": number,"id": string,"price": number,"tier_id": string,"tier_name": string
            }[]
                           },
"respond_booking":
{ Args: { "p_approve": boolean,"p_booking_id": string,"p_reply": string }; Returns: undefined
                           },
"review_booking":
{ Args: { "p_body": string,"p_booking_id": string,"p_rating": number }; Returns: string
                           },
"review_organizer":
{ Args: { "p_body": string,"p_event_id": string,"p_rating": number }; Returns: string
                           },
"save_addons":
{ Args: { "p": Json,"p_event_id": string }; Returns: undefined
                           },
"save_membership":
{ Args: { "p": Json,"p_organizer_id": string }; Returns: string
                           },
"save_promoter_link":
{ Args: { "p_code": string,"p_email": string,"p_event_id": string,"p_name": string,"p_pct": number }; Returns: string
                           },
"save_seating":
{ Args: { "p": Json,"p_event_id": string,"p_tier_id": string }; Returns: number
                           },
"save_venue":
{ Args: { "p": Json }; Returns: string
                           },
"seat_map":
{ Args: { "p_event_id": string }; Returns: {
              "free": boolean,"held": boolean,"id": string,"kind": string,"row_label": string,"seat_number": number,"seat_position": number,"section": string,"tier_id": string
            }[]
                           },
"set_fee_mode":
{ Args: { "p_event_id": string,"p_mode": string }; Returns: undefined
                           },
"set_follow":
{ Args: { "p_follow": boolean,"p_organizer_id": string }; Returns: undefined
                           },
"set_organizer_images":
{ Args: { "p_avatar_path"?: string,"p_banner_path"?: string,"p_id": string }; Returns: undefined
                           },
"set_payout_account":
{ Args: { "p_bank": string,"p_name": string,"p_number": string,"p_usd_number"?: string }; Returns: undefined
                           },
"set_promo_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: undefined
                           },
"set_promoter_active":
{ Args: { "p_active": boolean,"p_id": string }; Returns: undefined
                           },
"set_public_sale":
{ Args: { "p_at"?: string,"p_event_id": string }; Returns: undefined
                           },
"set_saved":
{ Args: { "p_event_id": string,"p_saved": boolean }; Returns: undefined
                           },
"set_seats_held":
{ Args: { "p_event_id": string,"p_held": boolean,"p_seat_ids": (string)[] }; Returns: number
                           },
"set_waitlist":
{ Args: { "p_on": boolean,"p_tier_id": string }; Returns: undefined
                           },
"submit_identity_verification":
{ Args: { "p": Json }; Returns: string
                           },
"submit_venue_verification":
{ Args: { "p": Json }; Returns: string
                           },
"transfer_ticket":
{ Args: { "p_code": string,"p_email": string,"p_name": string }; Returns: undefined
                           },
"update_event":
{ Args: { "p": Json,"p_id": string }; Returns: undefined
                           },
"update_organizer":
{ Args: { "p_bio": string,"p_id": string,"p_name": string }; Returns: undefined
                           },
"venue_busy":
{ Args: { "p_from": string,"p_to": string,"p_venue_id": string }; Returns: {
              "ends_at": string,"starts_at": string
            }[]
                           }
          }
          Enums: {
            "booking_status": "pending"|"approved"|"declined"|"cancelled","event_category": "Music"|"Culture"|"Food"|"Water"|"Sport"|"Art"|"Nightlife"|"Comedy"|"Film"|"Wellness"|"Talks"|"Workshop"|"Family"|"Festival"|"Charity","event_status": "scheduled"|"rescheduled"|"cancelled","listing_status": "draft"|"pending"|"approved"|"rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "booking_status": ["pending", "approved", "declined", "cancelled"],"event_category": ["Music", "Culture", "Food", "Water", "Sport", "Art", "Nightlife", "Comedy", "Film", "Wellness", "Talks", "Workshop", "Family", "Festival", "Charity"],"event_status": ["scheduled", "rescheduled", "cancelled"],"listing_status": ["draft", "pending", "approved", "rejected"]
          }
        }
} as const
