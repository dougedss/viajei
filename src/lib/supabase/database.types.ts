
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "achievements": {
                  Row: {
                    "created_at": string,"id": string,"key": string,"synced_at": string,"trip_id": string | null,"unlocked_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"key": string,"synced_at": string,"trip_id"?: string | null,"unlocked_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key"?: string,"synced_at"?: string,"trip_id"?: string | null,"unlocked_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "achievements_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "achievements_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_imports": {
                  Row: {
                    "created_at": string,"error": string | null,"finished_at": string | null,"id": string,"input_chars": number,"input_tokens": number | null,"model": string,"output_tokens": number | null,"status": string,"trip_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input_chars": number,"input_tokens"?: number | null,"model": string,"output_tokens"?: number | null,"status"?: string,"trip_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input_chars"?: number,"input_tokens"?: number | null,"model"?: string,"output_tokens"?: number | null,"status"?: string,"trip_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_imports_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_imports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"filename": string,"height": number | null,"id": string,"kind": string,"mime": string,"placeholder": string | null,"reservation_id": string | null,"size_bytes": number,"stop_id": string | null,"storage_path": string,"synced_at": string,"trip_id": string,"updated_at": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"filename": string,"height"?: number | null,"id": string,"kind": string,"mime": string,"placeholder"?: string | null,"reservation_id"?: string | null,"size_bytes": number,"stop_id"?: string | null,"storage_path": string,"synced_at": string,"trip_id": string,"updated_at": string,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"filename"?: string,"height"?: number | null,"id"?: string,"kind"?: string,"mime"?: string,"placeholder"?: string | null,"reservation_id"?: string | null,"size_bytes"?: number,"stop_id"?: string | null,"storage_path"?: string,"synced_at"?: string,"trip_id"?: string,"updated_at"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_reservation_id_trip_id_fkey"
      columns: ["reservation_id","trip_id"]
isOneToOne: false
      referencedRelation: "reservations"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "attachments_stop_id_trip_id_fkey"
      columns: ["stop_id","trip_id"]
isOneToOne: false
      referencedRelation: "stops"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "attachments_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"checklist_items": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"done_at": string | null,"done_by": string | null,"field_versions": NonNullable<Json>,"id": string,"kind": string,"points": number,"position": string,"source": string,"status": string,"stop_id": string | null,"synced_at": string,"text": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"deleted_at"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"kind": string,"points"?: number,"position": string,"source"?: string,"status"?: string,"stop_id"?: string | null,"synced_at": string,"text": string,"trip_id": string,"updated_at": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"kind"?: string,"points"?: number,"position"?: string,"source"?: string,"status"?: string,"stop_id"?: string | null,"synced_at"?: string,"text"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checklist_items_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checklist_items_stop_id_trip_id_fkey"
      columns: ["stop_id","trip_id"]
isOneToOne: false
      referencedRelation: "stops"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "checklist_items_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"name": string,"notes": string | null,"phone": string,"synced_at": string,"trip_id": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"name": string,"notes"?: string | null,"phone": string,"synced_at": string,"trip_id": string,"type": string,"updated_at": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string,"synced_at"?: string,"trip_id"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"edge_calls": {
                  Row: {
                    "created_at": string,"fn": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fn": string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"fn"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "edge_calls_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"category": string,"created_at": string,"created_by": string,"date": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"notes": string | null,"paid_by": string,"reservation_id": string | null,"stop_id": string | null,"synced_at": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category": string,"created_at"?: string,"created_by": string,"date": string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"notes"?: string | null,"paid_by": string,"reservation_id"?: string | null,"stop_id"?: string | null,"synced_at": string,"trip_id": string,"updated_at": string
                  }
                  Update: {
                    "amount"?: number,"category"?: string,"created_at"?: string,"created_by"?: string,"date"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"notes"?: string | null,"paid_by"?: string,"reservation_id"?: string | null,"stop_id"?: string | null,"synced_at"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_paid_by_fkey"
      columns: ["paid_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_reservation_id_trip_id_fkey"
      columns: ["reservation_id","trip_id"]
isOneToOne: false
      referencedRelation: "reservations"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "expenses_stop_id_trip_id_fkey"
      columns: ["stop_id","trip_id"]
isOneToOne: false
      referencedRelation: "stops"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "expenses_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"lab_checks": {
                  Row: {
                    "data": NonNullable<Json>,"detail": string | null,"latency_ms": number | null,"run_id": string,"scenario": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data"?: NonNullable<Json>,"detail"?: string | null,"latency_ms"?: number | null,"run_id": string,"scenario": string,"status": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"detail"?: string | null,"latency_ms"?: number | null,"run_id"?: string,"scenario"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lab_checks_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "lab_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"lab_inbox": {
                  Row: {
                    "body_b64": string | null,"content_encoding": string | null,"gone": boolean,"id": number,"inbox": string,"received_at": string,"size_bytes": number,"status_code": number,"subscription_id": string | null,"topic": string | null,"ttl": number | null,"urgency": string | null,"user_id": string,"vapid_aud": string | null,"vapid_error": string | null,"vapid_exp": string | null,"vapid_ok": boolean,"vapid_sub": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body_b64"?: string | null,"content_encoding"?: string | null,"gone"?: boolean,"id"?: never,"inbox": string,"received_at"?: string,"size_bytes": number,"status_code": number,"subscription_id"?: string | null,"topic"?: string | null,"ttl"?: number | null,"urgency"?: string | null,"user_id": string,"vapid_aud"?: string | null,"vapid_error"?: string | null,"vapid_exp"?: string | null,"vapid_ok": boolean,"vapid_sub"?: string | null
                  }
                  Update: {
                    "body_b64"?: string | null,"content_encoding"?: string | null,"gone"?: boolean,"id"?: never,"inbox"?: string,"received_at"?: string,"size_bytes"?: number,"status_code"?: number,"subscription_id"?: string | null,"topic"?: string | null,"ttl"?: number | null,"urgency"?: string | null,"user_id"?: string,"vapid_aud"?: string | null,"vapid_error"?: string | null,"vapid_exp"?: string | null,"vapid_ok"?: boolean,"vapid_sub"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lab_inbox_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lab_runs": {
                  Row: {
                    "commit_sha": string | null,"created_at": string,"diagnostics": NonNullable<Json>,"finished_at": string,"id": string,"runner_id": string,"source": string,"started_at": string,"status": string,"summary": string | null,"target": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commit_sha"?: string | null,"created_at"?: string,"diagnostics"?: NonNullable<Json>,"finished_at": string,"id": string,"runner_id"?: string,"source": string,"started_at": string,"status": string,"summary"?: string | null,"target": string
                  }
                  Update: {
                    "commit_sha"?: string | null,"created_at"?: string,"diagnostics"?: NonNullable<Json>,"finished_at"?: string,"id"?: string,"runner_id"?: string,"source"?: string,"started_at"?: string,"status"?: string,"summary"?: string | null,"target"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_prefs": {
                  Row: {
                    "created_at": string,"enabled": boolean,"field_versions": NonNullable<Json>,"id": string,"kinds": NonNullable<Json>,"lead_minutes": number,"morning_time": string,"synced_at": string,"trip_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"field_versions"?: NonNullable<Json>,"id": string,"kinds"?: NonNullable<Json>,"lead_minutes"?: number,"morning_time"?: string,"synced_at": string,"trip_id": string,"updated_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"field_versions"?: NonNullable<Json>,"id"?: string,"kinds"?: NonNullable<Json>,"lead_minutes"?: number,"morning_time"?: string,"synced_at"?: string,"trip_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications_sent": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"created_at": string,"data": NonNullable<Json>,"error": string | null,"id": string,"kind": string,"ref": string,"scheduled_at": string,"sent_at": string | null,"status": string,"stop_id": string | null,"trip_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"error"?: string | null,"id": string,"kind": string,"ref": string,"scheduled_at": string,"sent_at"?: string | null,"status"?: string,"stop_id"?: string | null,"trip_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"error"?: string | null,"id"?: string,"kind"?: string,"ref"?: string,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: string,"stop_id"?: string | null,"trip_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_sent_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_sent_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "achievement_keys": (string)[],"color": string,"created_at": string,"field_versions": NonNullable<Json>,"id": string,"name": string,"synced_at": string,"updated_at": string,"xp_total": number
                  }
                  ComputedFields: never
                  Insert: {
                    "achievement_keys"?: (string)[],"color": string,"created_at"?: string,"field_versions"?: NonNullable<Json>,"id": string,"name": string,"synced_at": string,"updated_at": string,"xp_total"?: number
                  }
                  Update: {
                    "achievement_keys"?: (string)[],"color"?: string,"created_at"?: string,"field_versions"?: NonNullable<Json>,"id"?: string,"name"?: string,"synced_at"?: string,"updated_at"?: string,"xp_total"?: number
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"failed_at": string | null,"id": string,"last_seen_at": string,"origin": string,"p256dh": string,"platform": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"failed_at"?: string | null,"id"?: string,"last_seen_at"?: string,"origin": string,"p256dh": string,"platform": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"failed_at"?: string | null,"id"?: string,"last_seen_at"?: string,"origin"?: string,"p256dh"?: string,"platform"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reservations": {
                  Row: {
                    "address": string | null,"amount": number | null,"booked_via": string | null,"cancel_policy": string | null,"cancel_until": string | null,"confirmation_code": string | null,"created_at": string,"created_by": string,"deleted_at": string | null,"end_at": string | null,"field_versions": NonNullable<Json>,"id": string,"name": string,"notes": string | null,"phone": string | null,"start_at": string | null,"stop_id": string | null,"synced_at": string,"trip_day_id": string | null,"trip_id": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"amount"?: number | null,"booked_via"?: string | null,"cancel_policy"?: string | null,"cancel_until"?: string | null,"confirmation_code"?: string | null,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"end_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"name": string,"notes"?: string | null,"phone"?: string | null,"start_at"?: string | null,"stop_id"?: string | null,"synced_at": string,"trip_day_id"?: string | null,"trip_id": string,"type": string,"updated_at": string
                  }
                  Update: {
                    "address"?: string | null,"amount"?: number | null,"booked_via"?: string | null,"cancel_policy"?: string | null,"cancel_until"?: string | null,"confirmation_code"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"end_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"start_at"?: string | null,"stop_id"?: string | null,"synced_at"?: string,"trip_day_id"?: string | null,"trip_id"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reservations_stop_id_trip_id_fkey"
      columns: ["stop_id","trip_id"]
isOneToOne: false
      referencedRelation: "stops"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "reservations_trip_day_id_trip_id_fkey"
      columns: ["trip_day_id","trip_id"]
isOneToOne: false
      referencedRelation: "trip_days"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "reservations_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"stop_memories": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"memo": string | null,"rating": number | null,"stop_id": string,"synced_at": string,"trip_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"memo"?: string | null,"rating"?: number | null,"stop_id": string,"synced_at": string,"trip_id": string,"updated_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"memo"?: string | null,"rating"?: number | null,"stop_id"?: string,"synced_at"?: string,"trip_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stop_memories_stop_id_trip_id_fkey"
      columns: ["stop_id","trip_id"]
isOneToOne: false
      referencedRelation: "stops"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "stop_memories_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stop_memories_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stops": {
                  Row: {
                    "address": string | null,"closes_at": string | null,"created_at": string,"deleted_at": string | null,"departed_at": string | null,"done_at": string | null,"done_by": string | null,"field_versions": NonNullable<Json>,"id": string,"kind": string,"lat": number | null,"lng": number | null,"name": string,"notes": string | null,"position": string,"skipped": boolean,"source": string,"synced_at": string,"time": string | null,"travel_minutes_to_next": number | null,"trip_day_id": string,"trip_id": string,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"closes_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"departed_at"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"kind": string,"lat"?: number | null,"lng"?: number | null,"name": string,"notes"?: string | null,"position": string,"skipped"?: boolean,"source"?: string,"synced_at": string,"time"?: string | null,"travel_minutes_to_next"?: number | null,"trip_day_id": string,"trip_id": string,"updated_at": string,"url"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"closes_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"departed_at"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"kind"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string,"notes"?: string | null,"position"?: string,"skipped"?: boolean,"source"?: string,"synced_at"?: string,"time"?: string | null,"travel_minutes_to_next"?: number | null,"trip_day_id"?: string,"trip_id"?: string,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stops_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stops_trip_day_id_trip_id_fkey"
      columns: ["trip_day_id","trip_id"]
isOneToOne: false
      referencedRelation: "trip_days"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "stops_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_days": {
                  Row: {
                    "created_at": string,"date": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"notes": string | null,"synced_at": string,"title": string | null,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"notes"?: string | null,"synced_at": string,"title"?: string | null,"trip_id": string,"updated_at": string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"notes"?: string | null,"synced_at"?: string,"title"?: string | null,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_days_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_members": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"invited_by": string | null,"invited_email": string | null,"role": string,"share_position": boolean,"status": string,"synced_at": string,"trip_id": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"invited_by"?: string | null,"invited_email"?: string | null,"role": string,"share_position"?: boolean,"status"?: string,"synced_at": string,"trip_id": string,"updated_at": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"invited_by"?: string | null,"invited_email"?: string | null,"role"?: string,"share_position"?: boolean,"status"?: string,"synced_at"?: string,"trip_id"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_members_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_members_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_tracks": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"field_versions": NonNullable<Json>,"id": string,"points": NonNullable<Json>,"synced_at": string,"trip_day_id": string,"trip_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"points"?: NonNullable<Json>,"synced_at": string,"trip_day_id": string,"trip_id": string,"updated_at": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"points"?: NonNullable<Json>,"synced_at"?: string,"trip_day_id"?: string,"trip_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_tracks_trip_day_id_trip_id_fkey"
      columns: ["trip_day_id","trip_id"]
isOneToOne: false
      referencedRelation: "trip_days"
      referencedColumns: ["id","trip_id"]
    },{
      foreignKeyName: "trip_tracks_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_tracks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "budget": number | null,"car_accessories": (string)[],"car_color": string,"car_model": string,"created_at": string,"deleted_at": string | null,"end_date": string,"field_versions": NonNullable<Json>,"id": string,"name": string,"notes": string | null,"origin": string | null,"owner_id": string,"start_date": string,"synced_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget"?: number | null,"car_accessories"?: (string)[],"car_color"?: string,"car_model"?: string,"created_at"?: string,"deleted_at"?: string | null,"end_date": string,"field_versions"?: NonNullable<Json>,"id": string,"name": string,"notes"?: string | null,"origin"?: string | null,"owner_id": string,"start_date": string,"synced_at": string,"updated_at": string
                  }
                  Update: {
                    "budget"?: number | null,"car_accessories"?: (string)[],"car_color"?: string,"car_model"?: string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string,"field_versions"?: NonNullable<Json>,"id"?: string,"name"?: string,"notes"?: string | null,"origin"?: string | null,"owner_id"?: string,"start_date"?: string,"synced_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"xp_events": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"points": number,"ref_id": string,"synced_at": string,"trip_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"kind": string,"points": number,"ref_id": string,"synced_at": string,"trip_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"points"?: number,"ref_id"?: string,"synced_at"?: string,"trip_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "xp_events_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "xp_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_member_id": string }; Returns: string
                           },
"claim_due_notifications":
{ Args: { "p_now"?: string }; Returns: {
              "attempts": number,"data": Json,"id": string,"kind": string,"ref": string,"scheduled_at": string,"stop_id": string,"subscriptions": Json,"trip_id": string,"user_id": string
            }[]
                           },
"claim_invites":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"decline_invite":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"due_notifications":
{ Args: { "p_now"?: string }; Returns: {
              "data": Json,"kind": string,"ref": string,"scheduled_at": string,"stop_id": string,"trip_day_id": string,"trip_id": string,"user_id": string
            }[]
                           },
"edge_call":
{ Args: { "p_fn": string,"p_limit": number }; Returns: number
                           },
"lab_diagnostics":
{ Args: { "p_since": string }; Returns: Json
                           },
"lab_grant":
{ Args: { "p_email": string,"p_role": string }; Returns: string
                           },
"lab_mark_horizon":
{ Args: { "p_trip_id": string }; Returns: undefined
                           },
"lab_purge_preview":
{ Args: { "p_logs_before": string,"p_orphans_before": string,"p_tombstones_before": string,"p_trips_before": string }; Returns: Json
                           },
"lab_reset_progress":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_lab_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_pending_invites":
{ Args: Record<PropertyKey, never>; Returns: {
              "end_date": string,"invited_by_name": string,"member_id": string,"start_date": string,"trip_id": string,"trip_name": string
            }[]
                           },
"purge":
{ Args: { "p_dry_run": boolean,"p_logs_before": string,"p_orphans_before": string,"p_tombstones_before": string,"p_trips_before": string }; Returns: Json
                           },
"sync_pull":
{ Args: { "p_since": string,"p_trip_id": string }; Returns: Json
                           },
"sync_pull_user":
{ Args: { "p_since": string }; Returns: Json
                           },
"sync_push":
{ Args: { "p_ops": Json }; Returns: Json
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
