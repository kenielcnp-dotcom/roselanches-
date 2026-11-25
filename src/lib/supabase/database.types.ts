
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"after": Json | null,"before": Json | null,"business_id": string,"created_at": string,"entity": string,"entity_id": string | null,"id": number,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"business_id": string,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: never,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"business_id"?: string,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: never,"reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"business_members": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"is_active": boolean,"role": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"role": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_settings": {
                  Row: {
                    "allow_online_confirmation": boolean,"business_id": string,"created_at": string,"default_sale_period": string | null,"item_max_qty": number,"pix_city": string | null,"pix_key": string | null,"pix_key_type": string | null,"pix_receiver_name": string | null,"require_signature": boolean,"sale_max_cents": number,"signature_retention_months": number,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_online_confirmation"?: boolean,"business_id": string,"created_at"?: string,"default_sale_period"?: string | null,"item_max_qty"?: number,"pix_city"?: string | null,"pix_key"?: string | null,"pix_key_type"?: string | null,"pix_receiver_name"?: string | null,"require_signature"?: boolean,"sale_max_cents"?: number,"signature_retention_months"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "allow_online_confirmation"?: boolean,"business_id"?: string,"created_at"?: string,"default_sale_period"?: string | null,"item_max_qty"?: number,"pix_city"?: string | null,"pix_key"?: string | null,"pix_key_type"?: string | null,"pix_receiver_name"?: string | null,"require_signature"?: boolean,"sale_max_cents"?: number,"signature_retention_months"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_settings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"consent_texts": {
                  Row: {
                    "body": string,"created_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"version": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer_establishments": {
                  Row: {
                    "business_id": string,"created_at": string,"created_by": string | null,"customer_id": string,"establishment_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"establishment_id": string,"id"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"establishment_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_establishments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "customer_establishments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "customer_establishments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "customer_establishments_establishment_id_business_id_fkey"
      columns: ["establishment_id","business_id"]
isOneToOne: false
      referencedRelation: "establishment_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "customer_establishments_establishment_id_business_id_fkey"
      columns: ["establishment_id","business_id"]
isOneToOne: false
      referencedRelation: "establishments"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"customer_invites": {
                  Row: {
                    "business_id": string,"cancelled_at": string | null,"created_at": string,"created_by": string,"customer_id": string,"expires_at": string,"id": string,"token_hash": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cancelled_at"?: string | null,"created_at"?: string,"created_by": string,"customer_id": string,"expires_at": string,"id"?: string,"token_hash": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"cancelled_at"?: string | null,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"expires_at"?: string,"id"?: string,"token_hash"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_invites_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "customer_invites_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "customer_invites_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "auth_user_id": string | null,"business_id": string,"created_at": string,"created_by": string | null,"full_name": string,"id": string,"is_active": boolean,"linked_at": string | null,"notes": string | null,"phone_e164": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"full_name": string,"id"?: string,"is_active"?: boolean,"linked_at"?: string | null,"notes"?: string | null,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"full_name"?: string,"id"?: string,"is_active"?: boolean,"linked_at"?: string | null,"notes"?: string | null,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"establishments": {
                  Row: {
                    "address": string | null,"business_id": string,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"name": string,"nickname": string | null,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"nickname"?: string | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"nickname"?: string | null,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "establishments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"financial_adjustments": {
                  Row: {
                    "amount_cents": number,"business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string,"customer_id": string,"direction": string,"id": string,"occurred_at": string,"reason": string,"related_payment_id": string | null,"related_sale_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"business_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by": string,"customer_id": string,"direction": string,"id": string,"occurred_at"?: string,"reason": string,"related_payment_id"?: string | null,"related_sale_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"business_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"direction"?: string,"id"?: string,"occurred_at"?: string,"reason"?: string,"related_payment_id"?: string | null,"related_sale_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_adjustments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "financial_adjustments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "financial_adjustments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "financial_adjustments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "financial_adjustments_related_payment_id_business_id_custo_fkey"
      columns: ["related_payment_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "payment_list"
      referencedColumns: ["id","business_id","customer_id"]
    },{
      foreignKeyName: "financial_adjustments_related_payment_id_business_id_custo_fkey"
      columns: ["related_payment_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","business_id","customer_id"]
    },{
      foreignKeyName: "financial_adjustments_related_sale_id_business_id_customer_fkey"
      columns: ["related_sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_dispute_list"
      referencedColumns: ["sale_id","business_id","customer_id"]
    },{
      foreignKeyName: "financial_adjustments_related_sale_id_business_id_customer_fkey"
      columns: ["related_sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_list"
      referencedColumns: ["id","business_id","customer_id"]
    },{
      foreignKeyName: "financial_adjustments_related_sale_id_business_id_customer_fkey"
      columns: ["related_sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","business_id","customer_id"]
    }
                  ]
                },"opening_balances": {
                  Row: {
                    "amount_cents": number,"business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string,"customer_id": string,"id": string,"note": string,"reference_date": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"business_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by": string,"customer_id": string,"id": string,"note": string,"reference_date": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"business_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"id"?: string,"note"?: string,"reference_date"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opening_balances_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opening_balances_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "opening_balances_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "opening_balances_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"payment_notifications": {
                  Row: {
                    "amount_cents": number | null,"business_id": string,"created_at": string,"created_by": string,"customer_id": string,"id": string,"note": string | null,"payment_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number | null,"business_id": string,"created_at"?: string,"created_by": string,"customer_id": string,"id": string,"note"?: string | null,"payment_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number | null,"business_id"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"id"?: string,"note"?: string | null,"payment_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_notifications_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_notifications_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "payment_notifications_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payment_notifications_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payment_notifications_payment_id_business_id_fkey"
      columns: ["payment_id","business_id"]
isOneToOne: false
      referencedRelation: "payment_list"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payment_notifications_payment_id_business_id_fkey"
      columns: ["payment_id","business_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"business_id": string,"created_at": string,"created_by": string,"customer_id": string,"id": string,"method": string,"note": string | null,"notification_id": string | null,"received_at": string,"request_hash": string,"reverse_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"sale_id": string | null,"source": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"business_id": string,"created_at"?: string,"created_by": string,"customer_id": string,"id": string,"method": string,"note"?: string | null,"notification_id"?: string | null,"received_at": string,"request_hash": string,"reverse_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"sale_id"?: string | null,"source": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"business_id"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"id"?: string,"method"?: string,"note"?: string | null,"notification_id"?: string | null,"received_at"?: string,"request_hash"?: string,"reverse_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"sale_id"?: string | null,"source"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "payments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_notification_id_business_id_fkey"
      columns: ["notification_id","business_id"]
isOneToOne: false
      referencedRelation: "payment_notification_list"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_notification_id_business_id_fkey"
      columns: ["notification_id","business_id"]
isOneToOne: false
      referencedRelation: "payment_notifications"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_dispute_list"
      referencedColumns: ["sale_id","business_id","customer_id"]
    },{
      foreignKeyName: "payments_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_list"
      referencedColumns: ["id","business_id","customer_id"]
    },{
      foreignKeyName: "payments_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","business_id","customer_id"]
    }
                  ]
                },"products": {
                  Row: {
                    "business_id": string,"category": string | null,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"name": string,"price_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id"?: string,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"price_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"price_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sale_confirmations": {
                  Row: {
                    "business_id": string,"captured_at": string | null,"captured_by": string | null,"confirmation_status": string,"confirmation_type": string,"confirmed_by_user_id": string | null,"consent_text_version": string,"created_at": string,"customer_id": string,"dispute_reason": string | null,"id": string,"invalidated_at": string | null,"invalidated_by": string | null,"invalidation_reason": string | null,"received_at": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"sale_id": string,"signature_file_sha256": string | null,"signature_size_bytes": number | null,"signature_storage_path": string | null,"signed_document_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"captured_at"?: string | null,"captured_by"?: string | null,"confirmation_status": string,"confirmation_type": string,"confirmed_by_user_id"?: string | null,"consent_text_version": string,"created_at"?: string,"customer_id": string,"dispute_reason"?: string | null,"id": string,"invalidated_at"?: string | null,"invalidated_by"?: string | null,"invalidation_reason"?: string | null,"received_at"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"sale_id": string,"signature_file_sha256"?: string | null,"signature_size_bytes"?: number | null,"signature_storage_path"?: string | null,"signed_document_hash": string
                  }
                  Update: {
                    "business_id"?: string,"captured_at"?: string | null,"captured_by"?: string | null,"confirmation_status"?: string,"confirmation_type"?: string,"confirmed_by_user_id"?: string | null,"consent_text_version"?: string,"created_at"?: string,"customer_id"?: string,"dispute_reason"?: string | null,"id"?: string,"invalidated_at"?: string | null,"invalidated_by"?: string | null,"invalidation_reason"?: string | null,"received_at"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"sale_id"?: string,"signature_file_sha256"?: string | null,"signature_size_bytes"?: number | null,"signature_storage_path"?: string | null,"signed_document_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_confirmations_consent_text_version_fkey"
      columns: ["consent_text_version"]
isOneToOne: false
      referencedRelation: "consent_texts"
      referencedColumns: ["version"]
    },{
      foreignKeyName: "sale_confirmations_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_dispute_list"
      referencedColumns: ["sale_id","business_id","customer_id"]
    },{
      foreignKeyName: "sale_confirmations_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_list"
      referencedColumns: ["id","business_id","customer_id"]
    },{
      foreignKeyName: "sale_confirmations_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","business_id","customer_id"]
    }
                  ]
                },"sale_items": {
                  Row: {
                    "business_id": string,"id": string,"position": number,"product_id": string,"product_name": string,"quantity": number,"sale_id": string,"subtotal_cents": number,"unit_price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"id"?: string,"position": number,"product_id": string,"product_name": string,"quantity": number,"sale_id": string,"subtotal_cents": number,"unit_price_cents": number
                  }
                  Update: {
                    "business_id"?: string,"id"?: string,"position"?: number,"product_id"?: string,"product_name"?: string,"quantity"?: number,"sale_id"?: string,"subtotal_cents"?: number,"unit_price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_items_product_id_business_id_fkey"
      columns: ["product_id","business_id"]
isOneToOne: false
      referencedRelation: "product_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sale_items_product_id_business_id_fkey"
      columns: ["product_id","business_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sale_items_sale_id_business_id_fkey"
      columns: ["sale_id","business_id"]
isOneToOne: false
      referencedRelation: "sale_dispute_list"
      referencedColumns: ["sale_id","business_id"]
    },{
      foreignKeyName: "sale_items_sale_id_business_id_fkey"
      columns: ["sale_id","business_id"]
isOneToOne: false
      referencedRelation: "sale_list"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sale_items_sale_id_business_id_fkey"
      columns: ["sale_id","business_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"confirmation_status": string,"created_at": string,"created_by": string,"customer_id": string,"description": string | null,"establishment_id": string,"id": string,"mode": string,"occurred_at": string,"payment_kind": string,"period": string,"received_at": string,"request_hash": string,"status": string,"total_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmation_status"?: string,"created_at"?: string,"created_by": string,"customer_id": string,"description"?: string | null,"establishment_id": string,"id": string,"mode": string,"occurred_at": string,"payment_kind": string,"period": string,"received_at"?: string,"request_hash": string,"status"?: string,"total_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmation_status"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"description"?: string | null,"establishment_id"?: string,"id"?: string,"mode"?: string,"occurred_at"?: string,"payment_kind"?: string,"period"?: string,"received_at"?: string,"request_hash"?: string,"status"?: string,"total_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_establishment_id_business_id_fkey"
      columns: ["establishment_id","business_id"]
isOneToOne: false
      referencedRelation: "establishment_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_establishment_id_business_id_fkey"
      columns: ["establishment_id","business_id"]
isOneToOne: false
      referencedRelation: "establishments"
      referencedColumns: ["id","business_id"]
    }
                  ]
                }
          }
          Views: {
            "customer_balances": {
                  Row: {
                    "balance_cents": number | null,"business_id": string,"credit_cents": number | null,"customer_id": string,"debit_cents": number | null,"last_payment_at": string | null,"last_sale_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_ledger": {
                  Row: {
                    "business_id": string | null,"credit_cents": number | null,"customer_id": string | null,"debit_cents": number | null,"entry_id": string | null,"establishment_id": string | null,"kind": string | null,"occurred_at": string | null,"settled_at_sale": boolean | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"customer_overview": {
                  Row: {
                    "balance_cents": number | null,"business_id": string,"created_at": string,"establishment_ids": (string)[] | null,"full_name": string,"id": string,"is_active": boolean,"last_payment_at": string | null,"last_sale_at": string | null,"linked_at": string | null,"notes": string | null,"phone_e164": string | null,"portal_linked": boolean | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"establishment_overview": {
                  Row: {
                    "address": string | null,"business_id": string,"created_at": string,"customer_count": number | null,"id": string,"is_active": boolean,"name": string,"nickname": string | null,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                           "address"?: string | null,"business_id"?: string | null,"created_at"?: string | null,"customer_count"?: never,"id"?: string | null,"is_active"?: boolean | null,"name"?: string | null,"nickname"?: string | null,"notes"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "address"?: string | null,"business_id"?: string | null,"created_at"?: string | null,"customer_count"?: never,"id"?: string | null,"is_active"?: boolean | null,"name"?: string | null,"nickname"?: string | null,"notes"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "establishments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_list": {
                  Row: {
                    "amount_cents": number,"business_id": string,"created_at": string,"customer_id": string,"customer_name": string,"id": string,"method": string,"note": string | null,"notification_id": string | null,"received_at": string,"reverse_reason": string | null,"reversed_at": string | null,"sale_id": string | null,"source": string,"status": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "payments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "payments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_notification_id_business_id_fkey"
      columns: ["notification_id","business_id"]
isOneToOne: false
      referencedRelation: "payment_notification_list"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_notification_id_business_id_fkey"
      columns: ["notification_id","business_id"]
isOneToOne: false
      referencedRelation: "payment_notifications"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payments_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_dispute_list"
      referencedColumns: ["sale_id","business_id","customer_id"]
    },{
      foreignKeyName: "payments_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sale_list"
      referencedColumns: ["id","business_id","customer_id"]
    },{
      foreignKeyName: "payments_sale_id_business_id_customer_id_fkey"
      columns: ["sale_id","business_id","customer_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","business_id","customer_id"]
    }
                  ]
                },"payment_notification_list": {
                  Row: {
                    "amount_cents": number | null,"business_id": string,"created_at": string,"customer_balance_cents": number | null,"customer_id": string,"customer_name": string,"customer_phone": string | null,"id": string,"note": string | null,"payment_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "payment_notifications_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_notifications_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "payment_notifications_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payment_notifications_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payment_notifications_payment_id_business_id_fkey"
      columns: ["payment_id","business_id"]
isOneToOne: false
      referencedRelation: "payment_list"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "payment_notifications_payment_id_business_id_fkey"
      columns: ["payment_id","business_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"product_overview": {
                  Row: {
                    "business_id": string,"category": string | null,"created_at": string,"id": string,"is_active": boolean,"last_sold_at": string | null,"name": string,"price_cents": number,"units_90d": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "products_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_dispute_list": {
                  Row: {
                    "business_id": string,"customer_id": string,"customer_name": string,"dispute_reason": string | null,"disputed_at": string,"establishment_name": string,"occurred_at": string,"sale_id": string,"total_cents": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "sales_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    }
                  ]
                },"sale_list": {
                  Row: {
                    "business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"confirmation_status": string,"customer_id": string,"customer_name": string,"customer_phone": string | null,"description": string | null,"establishment_id": string,"establishment_name": string,"id": string,"items_summary": string | null,"mode": string,"occurred_at": string,"paid_method": string | null,"payment_kind": string,"period": string,"received_at": string,"status": string,"total_cents": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "sales_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_balances"
      referencedColumns: ["customer_id","business_id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_customer_id_business_id_fkey"
      columns: ["customer_id","business_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_establishment_id_business_id_fkey"
      columns: ["establishment_id","business_id"]
isOneToOne: false
      referencedRelation: "establishment_overview"
      referencedColumns: ["id","business_id"]
    },{
      foreignKeyName: "sales_establishment_id_business_id_fkey"
      columns: ["establishment_id","business_id"]
isOneToOne: false
      referencedRelation: "establishments"
      referencedColumns: ["id","business_id"]
    }
                  ]
                }
          }
          Functions: {
            "cancel_customer_invite":
{ Args: { "p_customer": string }; Returns: undefined
                           },
"cancel_entry":
{ Args: { "p_id": string,"p_kind": string,"p_reason": string }; Returns: Json
                           },
"cancel_sale":
{ Args: { "p_reason": string,"p_sale_id": string }; Returns: Json
                           },
"confirm_payment_notification":
{ Args: { "p_amount_cents": number,"p_note"?: string,"p_notification_id": string,"p_payment_id": string,"p_received_at": string }; Returns: Json
                           },
"create_adjustment":
{ Args: { "p_entry": Json }; Returns: Json
                           },
"create_customer_invite":
{ Args: { "p_customer": string }; Returns: Json
                           },
"create_opening_balance":
{ Args: { "p_entry": Json }; Returns: Json
                           },
"create_sale":
{ Args: { "p_sale": Json }; Returns: Json
                           },
"customer_statement":
{ Args: { "p_before_at"?: string,"p_before_id"?: string,"p_customer": string,"p_limit"?: number }; Returns: {
              "amount_cents": number,"confirmation_status": string,"description": string,"entry_id": string,"establishment_id": string,"establishment_name": string,"items": Json,"kind": string,"method": string,"mode": string,"occurred_at": string,"open_cents": number,"payment_kind": string,"period": string,"status": string,"status_reason": string
            }[]
                           },
"dashboard_summary":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"portal_confirm_sale":
{ Args: { "p_confirmation": Json }; Returns: Json
                           },
"portal_dispute_sale":
{ Args: { "p_confirmation": Json }; Returns: Json
                           },
"portal_notify_payment":
{ Args: { "p_notice": Json }; Returns: Json
                           },
"portal_pix_info":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"portal_sale_detail":
{ Args: { "p_sale": string }; Returns: Json
                           },
"portal_statement":
{ Args: { "p_before_at"?: string,"p_before_id"?: string,"p_establishment"?: string,"p_filter"?: string,"p_limit"?: number }; Returns: {
              "amount_cents": number,"confirmation_status": string,"description": string,"entry_id": string,"establishment_id": string,"establishment_name": string,"items": Json,"kind": string,"method": string,"mode": string,"occurred_at": string,"open_cents": number,"payment_kind": string,"period": string,"status": string,"status_reason": string
            }[]
                           },
"portal_summary":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"redeem_customer_invite":
{ Args: { "p_token": string }; Returns: Json
                           },
"register_payment":
{ Args: { "p_payment": Json }; Returns: Json
                           },
"reject_payment_notification":
{ Args: { "p_notification_id": string,"p_reason": string }; Returns: Json
                           },
"report_establishments":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"report_sales":
{ Args: { "p_confirmation"?: string,"p_customer"?: string,"p_establishment"?: string,"p_from": string,"p_limit"?: number,"p_offset"?: number,"p_payment"?: string,"p_to": string }; Returns: {
              "cancel_reason": string,"confirmation_status": string,"customer_id": string,"customer_name": string,"establishment_name": string,"occurred_at": string,"open_cents": number,"paid_method": string,"payment_kind": string,"period": string,"sale_id": string,"status": string,"sum_cents": number,"sum_open_cents": number,"summary": string,"total_cents": number,"total_count": number
            }[]
                           },
"report_summary":
{ Args: { "p_customer"?: string,"p_establishment"?: string,"p_from": string,"p_to": string }; Returns: Json
                           },
"resolve_sale_dispute":
{ Args: { "p_note": string,"p_sale": string }; Returns: undefined
                           },
"reverse_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: Json
                           },
"sale_document_hash":
{ Args: { "p_sale": string,"p_terms": string }; Returns: string
                           },
"save_customer":
{ Args: { "p_establishment_ids": (string)[],"p_full_name": string,"p_id": string,"p_is_active": boolean,"p_notes": string,"p_phone_e164": string }; Returns: string
                           },
"signature_finalize":
{ Args: { "p_captured_at": string,"p_confirmation_id": string,"p_document_hash": string,"p_file_sha256": string,"p_sale_id": string,"p_size": number,"p_terms": string,"p_user": string }; Returns: Json
                           },
"signature_prepare":
{ Args: { "p_captured_at": string,"p_confirmation_id": string,"p_document_hash": string,"p_file_sha256": string,"p_sale_id": string,"p_size": number,"p_terms": string,"p_user": string }; Returns: Json
                           },
"unlink_customer_account":
{ Args: { "p_customer": string,"p_reason": string }; Returns: undefined
                           },
"whoami":
{ Args: Record<PropertyKey, never>; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
