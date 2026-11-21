export type Verification = 'verified' | 'unverified' | 'osm_imported';

export interface Location {
  id: string; name: string; category: string; description: string | null;
  lat: number; lng: number; location_context: string | null; alt_names: string[];
  accessibility: string | null; source_label: string; source_url: string | null;
  verification: Verification; last_verified_at: string | null; is_published: boolean;
  updated_at: string;
}
export interface Category { slug: string; label: string; icon: string; sort_order: number }

export interface Announcement {
  id: string; title: string; summary: string; body: string | null; category: string;
  source_org: string; source_url: string | null; location_id: string | null;
  status: 'draft' | 'pending' | 'published' | 'unpublished';
  published_at: string | null; updated_at: string; expires_at: string | null; created_at: string;
}

export interface FresherResource {
  id: string; section: string; title: string; body: string; is_official: boolean;
  source_label: string | null; source_url: string | null; source_updated_at: string | null;
  location_id: string | null; contact_phone: string | null; contact_email: string | null;
  opening_hours: string | null; sort_order: number; is_published: boolean; updated_at: string;
}

export interface ChecklistItem {
  id: string; title: string; explanation: string | null; kind: 'official' | 'suggestion';
  source_label: string | null; source_url: string | null; deadline: string | null;
  related_location_id: string | null; sort_order: number; is_published: boolean;
}

export interface Report {
  id: string; user_id: string | null; kind: string; location_id: string | null; announcement_id: string | null;
  message: string; suggested_lat: number | null; suggested_lng: number | null;
  status: 'open' | 'reviewing' | 'resolved' | 'rejected'; reviewer_note: string | null; created_at: string;
}

export interface RouteStep { instruction: string; name: string; distance_m: number; duration_s: number; type: number; way_points: [number, number] }
export interface RouteResult {
  provider: string; profile: string; distance_m: number; duration_s: number;
  coordinates: [number, number][]; steps: RouteStep[]; attribution: string;
}

export interface AssistantSource { id: string; kind: string; title: string; url: string | null; label: string | null; date?: string | null; official?: boolean; verification?: string }
export interface AssistantReply { answer: string; sources: AssistantSource[]; location_ids: string[]; model: string }

export interface SessionUser { id: string; email: string; name: string; emailVerified: boolean }
