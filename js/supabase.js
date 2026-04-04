import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://kwjhxahncliqxcfnwjnz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3amh4YWhuY2xpcXhjZm53am56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzU3OTcsImV4cCI6MjA5MDgxMTc5N30.PqpyDz-9cOcGdI7D4GJSjJoVKG-k-tQc-TDcV3C_d1U";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);