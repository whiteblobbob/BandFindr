ALTER TABLE public.users ADD CONSTRAINT users_auth_id_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT user_name_nonempty CHECK (length(trim(name)) BETWEEN 1 AND 100);
ALTER TABLE public.users ADD CONSTRAINT user_province_nonempty CHECK (length(trim(province)) BETWEEN 1 AND 100);
ALTER TABLE public.users ADD CONSTRAINT user_city_nonempty CHECK (length(trim(city)) BETWEEN 1 AND 100);
ALTER TABLE public.users ADD CONSTRAINT user_birth_date_valid CHECK (date_of_birth <= CURRENT_DATE AND date_of_birth >= '1900-01-01');

CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  metadata jsonb := NEW.raw_user_meta_data;
  field text;
BEGIN
  FOREACH field IN ARRAY ARRAY['name', 'province', 'city', 'date_of_birth'] LOOP
    IF metadata->>field IS NULL OR jsonb_typeof(metadata->field) <> 'string' OR length(trim(metadata->>field)) = 0 THEN
      RAISE EXCEPTION 'Data pendaftaran tidak lengkap.';
    END IF;
  END LOOP;
  IF metadata->>'date_of_birth' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Tanggal lahir tidak valid.';
  END IF;
  INSERT INTO public.users(id, name, province, city, date_of_birth)
  VALUES (NEW.id, trim(metadata->>'name'), trim(metadata->>'province'), trim(metadata->>'city'), (metadata->>'date_of_birth')::date);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.roles, public.genres, public.role_users, public.bands, public.band_roles, public.band_genres, public.band_members, public.applications, public.notifications FROM anon, authenticated;
