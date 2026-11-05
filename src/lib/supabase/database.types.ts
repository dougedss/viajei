
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "edge_calls": {
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
                    "color": string,"created_at": string,"field_versions": NonNullable<Json>,"id": string,"name": string,"synced_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color": string,"created_at"?: string,"field_versions"?: NonNullable<Json>,"id": string,"name": string,"synced_at": string,"updated_at": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"field_versions"?: NonNullable<Json>,"id"?: string,"name"?: string,"synced_at"?: string,"updated_at"?: string
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
                },"stops": {
                  Row: {
                    "address": string | null,"closes_at": string | null,"created_at": string,"deleted_at": string | null,"departed_at": string | null,"done_at": string | null,"done_by": string | null,"field_versions": NonNullable<Json>,"id": string,"kind": string,"lat": number | null,"lng": number | null,"name": string,"notes": string | null,"position": string,"skipped": boolean,"synced_at": string,"time": string | null,"travel_minutes_to_next": number | null,"trip_day_id": string,"trip_id": string,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"closes_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"departed_at"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"field_versions"?: NonNullable<Json>,"id": string,"kind": string,"lat"?: number | null,"lng"?: number | null,"name": string,"notes"?: string | null,"position": string,"skipped"?: boolean,"synced_at": string,"time"?: string | null,"travel_minutes_to_next"?: number | null,"trip_day_id": string,"trip_id": string,"updated_at": string,"url"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"closes_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"departed_at"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"field_versions"?: NonNullable<Json>,"id"?: string,"kind"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string,"notes"?: string | null,"position"?: string,"skipped"?: boolean,"synced_at"?: string,"time"?: string | null,"travel_minutes_to_next"?: number | null,"trip_day_id"?: string,"trip_id"?: string,"updated_at"?: string,"url"?: string | null
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
"my_pending_invites":
{ Args: Record<PropertyKey, never>; Returns: {
              "end_date": string,"invited_by_name": string,"member_id": string,"start_date": string,"trip_id": string,"trip_name": string
            }[]
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
