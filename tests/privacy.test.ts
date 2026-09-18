import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Execute the real migration against PostgreSQL semantics with minimal Auth/Storage fixtures.
test("database enforces reciprocal friendship, private avatars, and idempotent real step sync", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant select on storage.objects to authenticated;
    `);
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202609170001_stride.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202609180001_apple_health_steps.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const a = "00000000-0000-4000-8000-000000000001",
      b = "00000000-0000-4000-8000-000000000002",
      c = "00000000-0000-4000-8000-000000000003";
    for (const [id, handle] of [
      [a, "alice"],
      [b, "ben"],
      [c, "casey"],
    ])
      await db.query(`insert into auth.users values($1,$2::jsonb)`, [
        id,
        JSON.stringify({ handle, display_name: handle }),
      ]);
    await db.query(`update profiles set avatar_path=$1 where id=$2`, [
      `${a}/avatar.png`,
      a,
    ]);
    await db.query(
      `insert into storage.objects(bucket_id,name) values('avatars',$1)`,
      [`${a}/avatar.png`],
    );
    const asUser = async (id: string) => {
      await db.exec("reset role");
      await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    await asUser(a);
    await db.exec(
      `select sync_steps(current_date,1200,8000,'apple-health'); select sync_steps(current_date,1000,5000,'ios-motion');`,
    );
    const total = await db.query<{ steps: number; goal: number }>(
      `select steps,goal from daily_progress`,
    );
    assert.deepEqual(total.rows, [{ steps: 1200, goal: 8000 }]);
    await assert.rejects(
      db.exec(`select sync_steps(current_date,2000,8000,'demo')`),
    );
    await assert.rejects(
      db.exec(`update profiles set avatar_path='another-user/photo.png'`),
    );
    await db.exec(`select request_friend('ben')`);
    await asUser(b);
    assert.equal(
      (await db.query(`select * from daily_progress`)).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`select * from storage.objects`)).rows.length,
      0,
    );
    const pending = await db.query<{
      steps: number;
      avatar_path: string | null;
    }>(`select steps,avatar_path from friend_board(current_date)`);
    assert.equal(pending.rows[0].steps, 0);
    assert.equal(pending.rows[0].avatar_path, null);
    await db.query(`select accept_friend($1)`, [a]);
    assert.equal(
      (await db.query(`select * from daily_progress`)).rows.length,
      1,
    );
    assert.equal(
      (await db.query(`select * from storage.objects`)).rows.length,
      1,
    );
    await asUser(c);
    assert.equal((await db.query(`select * from profiles`)).rows.length, 1);
    assert.equal(
      (await db.query(`select * from daily_progress`)).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`select * from storage.objects`)).rows.length,
      0,
    );
    await assert.rejects(db.query(`select accept_friend($1)`, [a]));
    await assert.rejects(db.query(`select reserve_avatar($1)`, [a]));
    await asUser(b);
    await db.query(`select remove_friend($1)`, [a]);
    assert.equal(
      (await db.query(`select * from daily_progress`)).rows.length,
      0,
    );
    assert.equal(
      (await db.query(`select * from storage.objects`)).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
