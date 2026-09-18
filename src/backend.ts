import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { localDate, type Game } from "./game";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const backendReady = !!url && !!key;
const authStorage =
  Platform.OS === "web"
    ? AsyncStorage
    : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        removeItem: SecureStore.deleteItemAsync,
      };
export const supabase = backendReady
  ? createClient(url!, key!, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export type Friend = {
  id: string;
  name: string;
  handle: string;
  steps: number;
  goal: number;
  atlas?: string;
  status?: string;
  requester?: string;
};
export async function saveProgress(game: Game) {
  if (!supabase || game.today.source === "demo") return;
  const { error } = await supabase.rpc("sync_steps", {
    p_date: game.today.date,
    p_steps: game.today.steps,
    p_goal: game.today.goal,
    p_source: game.today.source,
  });
  if (error) throw error;
}
export async function getFriends(): Promise<Friend[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("friend_board", {
    p_date: localDate(),
  });
  if (error) throw error;
  return await Promise.all(
    (data ?? []).map(async (row: any) => {
      let atlas: string | undefined;
      if (row.avatar_path) {
        const { data } = await supabase!.storage
          .from("avatars")
          .createSignedUrl(row.avatar_path, 3600);
        atlas = data?.signedUrl;
      }
      return {
        id: row.id,
        name: row.display_name,
        handle: row.handle,
        steps: row.steps,
        goal: row.goal,
        status: row.status,
        requester: row.requester,
        atlas,
      };
    }),
  );
}
export async function requestFriend(handle: string) {
  if (!supabase) throw new Error("Sign in to add friends.");
  const { error } = await supabase.rpc("request_friend", {
    p_handle: handle.trim().replace(/^@/, "").toLowerCase(),
  });
  if (error) throw error;
}
export async function acceptFriend(id: string) {
  const { error } = await supabase!.rpc("accept_friend", { p_friend: id });
  if (error) throw error;
}
export async function removeFriend(id: string) {
  const { error } = await supabase!.rpc("remove_friend", { p_friend: id });
  if (error) throw error;
}
export async function generateAvatar(
  photoBase64: string,
  mimeType: string,
): Promise<string> {
  if (!supabase)
    throw new Error(
      "Personal avatar generation requires the backend setup described in the project README.",
    );
  const { data, error } = await supabase.functions.invoke("generate-avatar", {
    body: { photoBase64, mimeType, consent: true },
  });
  if (error)
    throw new Error(
      "Avatar generation did not complete. Check your connection and the server configuration, then try again.",
    );
  if (!data?.jobId)
    throw new Error("The avatar service did not start the job.");
  for (let attempt = 0; attempt < 90; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { data: job, error: readError } = await supabase
      .from("avatar_jobs")
      .select("status,path")
      .eq("id", data.jobId)
      .single();
    if (readError)
      throw new Error(
        "Could not check avatar progress. Sign in again and retry.",
      );
    if (job.status === "failed")
      throw new Error(
        "Avatar generation failed. Try a clear, front-facing photo or check the server setup.",
      );
    if (job.status === "ready" && job.path) return job.path;
  }
  throw new Error(
    "Your avatar is still processing. Reopen the app in a few minutes to load it.",
  );
}
export async function avatarUrl(path: string) {
  const { data, error } = await supabase!.storage
    .from("avatars")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
