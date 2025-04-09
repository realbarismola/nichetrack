import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kmenrvbtyixknurekjje.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttZW5ydmJ0eWl4a251cmVramplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0OTg1MTQsImV4cCI6MjA1OTA3NDUxNH0.viGlb1e3r8d5Jaur7Oe-d8uEBYO6UDgoxyAkoNmJ8s8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
