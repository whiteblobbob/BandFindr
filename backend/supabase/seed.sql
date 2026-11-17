INSERT INTO public.roles (name) VALUES
('Vocalist'), ('Guitarist'), ('Bassist'), ('Drummer'), ('Keyboardist'), ('Percussionist')
ON CONFLICT (name) DO NOTHING;
INSERT INTO public.genres (name) VALUES
('Pop'), ('Rock'), ('Jazz'), ('Blues'), ('Metal'), ('Punk'), ('Indie'), ('Folk'), ('Funk'), ('Reggae'), ('Electronic'), ('R&B')
ON CONFLICT (name) DO NOTHING;
