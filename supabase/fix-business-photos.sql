-- Galeria de fotos gerais do negócio (separada dos itens da vitrine) — mostra
-- fotos do ambiente/local, não amarradas a um produto/preço específico.
-- Roda isso uma vez no SQL Editor do Supabase.

create table if not exists public.business_photos (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.rooms(id) on delete cascade,
  imagem_url text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.business_photos to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter table public.business_photos enable row level security;

create policy "fotos do negócio públicas pra leitura" on public.business_photos for select using (true);
create policy "dono do room gerencia fotos do negócio" on public.business_photos for all using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);
