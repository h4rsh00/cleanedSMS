export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allowed_identifiers: {
        Row: {
          created_at: string
          id: string
          identifier: string
          role: Database["public"]["Enums"]["app_role"]
          used_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          role: Database["public"]["Enums"]["app_role"]
          used_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          role?: Database["public"]["Enums"]["app_role"]
          used_by?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          author_id: string
          body: string
          class_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          author_id: string
          body: string
          class_id: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          class_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          attachment_url: string | null
          class_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          max_marks: number
          title: string
        }
        Insert: {
          attachment_url?: string | null
          class_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          max_marks?: number
          title: string
        }
        Update: {
          attachment_url?: string | null
          class_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          max_marks?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          id: string
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          teacher_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          session_date: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          teacher_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          session_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          id: string
          program: string
          section: string
          semester: number
        }
        Insert: {
          created_at?: string
          id?: string
          program: string
          section?: string
          semester: number
        }
        Update: {
          created_at?: string
          id?: string
          program?: string
          section?: string
          semester?: number
        }
        Relationships: []
      }
      class_teachers: {
        Row: {
          class_id: string
          created_at: string
          id: string
          subject: string | null
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          subject?: string | null
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          subject?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          semester: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          semester?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          semester?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_id: string
          enrolled_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          enrolled_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          enrolled_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_attempts: {
        Row: {
          answers: Json
          id: string
          score: number
          student_id: string
          submitted_at: string
          test_id: string
        }
        Insert: {
          answers: Json
          id?: string
          score?: number
          student_id: string
          submitted_at?: string
          test_id: string
        }
        Update: {
          answers?: Json
          id?: string
          score?: number
          student_id?: string
          submitted_at?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_questions: {
        Row: {
          correct_index: number
          created_at: string
          id: string
          marks: number
          options: Json
          question: string
          test_id: string
        }
        Insert: {
          correct_index: number
          created_at?: string
          id?: string
          marks?: number
          options: Json
          question: string
          test_id: string
        }
        Update: {
          correct_index?: number
          created_at?: string
          id?: string
          marks?: number
          options?: Json
          question?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          participant_a: string
          participant_b: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          participant_a: string
          participant_b: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          participant_a?: string
          participant_b?: string
          subject?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          admission_date: string | null
          admission_no: string | null
          avatar_url: string | null
          batch_id: string | null
          bio: string | null
          created_at: string
          department: string | null
          dob: string | null
          full_name: string
          id: string
          id_card_url: string | null
          identifier: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admission_date?: string | null
          admission_no?: string | null
          avatar_url?: string | null
          batch_id?: string | null
          bio?: string | null
          created_at?: string
          department?: string | null
          dob?: string | null
          full_name?: string
          id: string
          id_card_url?: string | null
          identifier?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admission_date?: string | null
          admission_no?: string | null
          avatar_url?: string | null
          batch_id?: string | null
          bio?: string | null
          created_at?: string
          department?: string | null
          dob?: string | null
          full_name?: string
          id?: string
          id_card_url?: string | null
          identifier?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      student_documents: {
        Row: {
          doc_type: string
          file_url: string
          id: string
          student_id: string
          title: string
          uploaded_at: string
        }
        Insert: {
          doc_type?: string
          file_url: string
          id?: string
          student_id: string
          title: string
          uploaded_at?: string
        }
        Update: {
          doc_type?: string
          file_url?: string
          id?: string
          student_id?: string
          title?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: string
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          id: string
          notes: string | null
          student_id: string
          submitted_at: string
        }
        Insert: {
          assignment_id: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          id?: string
          notes?: string | null
          student_id: string
          submitted_at?: string
        }
        Update: {
          assignment_id?: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          id?: string
          notes?: string | null
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      test_scores: {
        Row: {
          created_at: string
          id: string
          score: number
          student_id: string
          test_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          score: number
          student_id: string
          test_id: string
        }
        Update: {
          created_at?: string
          id?: string
          score?: number
          student_id?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_scores_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_submissions: {
        Row: {
          file_url: string | null
          id: string
          notes: string | null
          student_id: string
          submitted_at: string
          test_id: string
        }
        Insert: {
          file_url?: string | null
          id?: string
          notes?: string | null
          student_id: string
          submitted_at?: string
          test_id: string
        }
        Update: {
          file_url?: string | null
          id?: string
          notes?: string | null
          student_id?: string
          submitted_at?: string
          test_id?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          max_marks: number
          paper_url: string | null
          test_date: string | null
          time_limit_minutes: number | null
          title: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          max_marks?: number
          paper_url?: string | null
          test_date?: string | null
          time_limit_minutes?: number | null
          title: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          max_marks?: number
          paper_url?: string | null
          test_date?: string | null
          time_limit_minutes?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_id: string
          day_of_week: number
          end_time: string
          id: string
          room: string | null
          start_time: string
          subject: string | null
          teacher_id: string | null
        }
        Insert: {
          class_id: string
          day_of_week: number
          end_time: string
          id?: string
          room?: string | null
          start_time: string
          subject?: string | null
          teacher_id?: string | null
        }
        Update: {
          class_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          room?: string | null
          start_time?: string
          subject?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assignment_class: { Args: { _assignment_id: string }; Returns: string }
      enroll_student_in_batch: {
        Args: { _batch: string; _student: string }
        Returns: undefined
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_class_member: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_class_teacher: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_thread_participant: {
        Args: { _thread: string; _user: string }
        Returns: boolean
      }
      teaches_student: {
        Args: { _student: string; _teacher: string }
        Returns: boolean
      }
      test_class: { Args: { _test_id: string }; Returns: string }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
      attendance_status: "present" | "absent" | "late"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "teacher", "admin"],
      attendance_status: ["present", "absent", "late"],
    },
  },
} as const
