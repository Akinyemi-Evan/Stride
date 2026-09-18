import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Flag,
  Flame,
  Footprints,
  Home,
  Leaf,
  LogOut,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import type { Session } from "@supabase/supabase-js";
import { Avatar } from "./src/Avatar";
import {
  changeGoal,
  claim,
  createGame,
  localDate,
  progress,
  QUESTS,
  restoreGame,
  rollover,
  setSteps,
  stageFor,
  STAGES,
  streak,
  type Game,
} from "./src/game";
import {
  acceptFriend,
  avatarUrl,
  backendReady,
  generateAvatar,
  getFriends,
  removeFriend,
  requestFriend,
  saveProgress,
  supabase,
  type Friend,
} from "./src/backend";
import { connectSteps } from "./src/steps";

const C = {
  bg: "#f6f7f2",
  ink: "#1f332c",
  muted: "#768178",
  line: "#e1e6dc",
  green: "#244c3a",
  lime: "#d5f27b",
  pale: "#edf1e6",
  white: "#ffffff",
  orange: "#edaa70",
};
const DEMO_FRIENDS: Friend[] = [
  { id: "a", name: "Jordan", handle: "jordan", steps: 8400, goal: 8000 },
  { id: "b", name: "Maya", handle: "maya.moves", steps: 6200, goal: 9000 },
  { id: "c", name: "Alex", handle: "alexoutside", steps: 3200, goal: 7000 },
];
type Tab = "Today" | "My avatar" | "Friends" | "Journey";
const tabs: { name: Tab; icon: typeof Home }[] = [
  { name: "Today", icon: Home },
  { name: "My avatar", icon: UserRound },
  { name: "Friends", icon: Users },
  { name: "Journey", icon: Flag },
];
const fmt = (n: number) => n.toLocaleString();
function Txt({ children, style, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text {...props} style={[s.text, style]}>
      {children}
    </Text>
  );
}
function Button({
  label,
  onPress,
  quiet = false,
  disabled = false,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
  icon?: typeof Plus;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quiet,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {Icon && <Icon size={17} color={quiet ? C.ink : C.white} />}
      <Txt style={[s.buttonText, quiet && { color: C.ink }]}>{label}</Txt>
    </Pressable>
  );
}
function Bar({ value, dark = false }: { value: number; dark?: boolean }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={[s.track, dark && { backgroundColor: "#496352" }]}
    >
      <View
        style={[
          s.fill,
          {
            width: `${Math.min(100, Math.max(0, value * 100))}%`,
            backgroundColor: dark ? C.lime : C.green,
          },
        ]}
      />
    </View>
  );
}
function Tag({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <View style={[s.tag, dark && { backgroundColor: "#3c5848" }]}>
      <Txt style={[s.tagText, dark && { color: C.lime }]}>{children}</Txt>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Stride />
    </SafeAreaProvider>
  );
}
function Stride() {
  const { width } = useWindowDimensions(),
    wide = width >= 1000,
    medium = width >= 700;
  const [tab, setTab] = useState<Tab>("Today");
  const [game, setGame] = useState<Game>(() => createGame());
  const gameRef = useRef(game);
  gameRef.current = game;
  const [demo, setDemo] = useState(true),
    [loadedKey, setLoadedKey] = useState<string | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [dialog, setDialog] = useState<
    "goal" | "camera" | "auth" | "friend" | "help" | null
  >(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false);
  const [goalInput, setGoalInput] = useState("8000"),
    [friends, setFriends] = useState<Friend[]>([]),
    [friendHandle, setFriendHandle] = useState("");
  const [previewStage, setPreviewStage] = useState<number | null>(null),
    [atlas, setAtlas] = useState<string | undefined>();
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null),
    [consent, setConsent] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [handle, setHandle] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [signup, setSignup] = useState(false);
  const stopSteps = useRef<null | (() => void)>(null),
    scope = useRef(0);
  const key = `stride.v1.${demo ? "demo" : (session?.user.id ?? "device")}`;
  const loaded = loadedKey === key;
  const currentProgress = progress(game.today.steps, game.today.goal),
    stage = stageFor(game.today.steps, game.today.goal),
    level = 1 + Math.floor(game.xp / 500);
  const showError = (err: unknown) =>
    setMessage(
      err instanceof Error
        ? err.message
        : "Something went wrong. Please try again.",
    );
  const work = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    const generation = ++scope.current;
    setLoadedKey(null);
    setConnected(false);
    stopSteps.current?.();
    stopSteps.current = null;
    void AsyncStorage.getItem(key)
      .then(async (raw) => {
        let saved = restoreGame(
          raw,
          demo
            ? "demo"
            : Platform.OS === "ios"
              ? "apple-health"
              : "health-connect",
        );
        if (session && !demo && supabase) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name,avatar_path")
            .eq("id", session.user.id)
            .single();
          if (profile)
            saved = {
              ...saved,
              name: profile.display_name,
              atlas: profile.avatar_path ?? undefined,
            };
          const { data: day } = await supabase
            .from("daily_progress")
            .select("steps,goal,source")
            .eq("user_id", session.user.id)
            .eq("date", saved.today.date)
            .maybeSingle();
          if (day)
            saved = {
              ...saved,
              today: {
                ...saved.today,
                steps: Math.max(saved.today.steps, day.steps),
                goal: day.goal,
                source: day.source,
              },
            };
        }
        if (!active) return;
        setGame(saved);
        setLoadedKey(key);
      })
      .catch(() => {
        if (active) {
          setGame(
            createGame(
              demo
                ? "demo"
                : Platform.OS === "ios"
                  ? "apple-health"
                  : "health-connect",
            ),
          );
          setLoadedKey(key);
          setMessage("Could not load saved progress.");
        }
      });
    return () => {
      active = false;
      if (scope.current === generation) scope.current++;
    };
  }, [key, demo]);
  useEffect(() => {
    if (loaded)
      void AsyncStorage.setItem(key, JSON.stringify(game)).catch(() =>
        setMessage(
          "Your device could not save progress. Free up some storage and try again.",
        ),
      );
  }, [game, loaded, key]);
  useEffect(() => {
    const tick = setInterval(() => setGame((g) => rollover(g)), 15000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!session || demo || !loaded) return;
    const timer = setTimeout(() => {
      void saveProgress(game).catch(() =>
        setMessage(
          "Progress saved on this device. Cloud sync will retry after your next update.",
        ),
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [game.today.steps, game.today.date, session, demo, loaded]);
  useEffect(() => {
    let active = true;
    setAtlas(undefined);
    if (game.atlas && session) {
      const refresh = () =>
        void avatarUrl(game.atlas!)
          .then((url) => {
            if (active) setAtlas(url);
          })
          .catch(() => {
            if (active)
              setMessage(
                "Could not load your avatar. Showing the starter avatar for now.",
              );
          });
      refresh();
      const timer = setInterval(refresh, 3000000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }
    return () => {
      active = false;
    };
  }, [game.atlas, session]);
  useEffect(() => {
    if (!session || demo) {
      setFriends([]);
      return;
    }
    let active = true;
    const refresh = () =>
      void getFriends()
        .then((rows) => {
          if (active) setFriends(rows);
        })
        .catch(showError);
    refresh();
    const timer = setInterval(refresh, 45000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, demo]);
  const startTracking = async () => {
    if (demo) {
      setDemo(false);
      setMessage(
        Platform.OS === "ios"
          ? "Tap Connect Apple Health and allow read access to Steps."
          : "Real walking mode is ready. Tap Connect steps to grant access.",
      );
      return;
    }
    stopSteps.current?.();
    stopSteps.current = null;
    setConnected(false);
    const generation = scope.current;
    const stop = await connectSteps((reading) => {
      if (scope.current === generation)
        setGame((g) => ({
          ...setSteps(g, reading.steps, reading.date),
          today: {
            ...setSteps(g, reading.steps, reading.date).today,
            source: reading.source,
          },
        }));
    }, setMessage);
    if (scope.current !== generation) {
      stop();
      return;
    }
    stopSteps.current = stop;
    setConnected(true);
    setMessage(
      Platform.OS === "ios"
        ? "Apple Health sync is on. If no steps appear, check Stride’s Steps access in Health and allow your watch to sync. Only your daily step total is used."
        : "Your steps are connected. Today’s total refreshes as you walk.",
    );
  };
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase?.auth.startAutoRefresh();
        setGame((g) => rollover(g));
        if (!demo && connected) void startTracking().catch(showError);
      } else {
        supabase?.auth.stopAutoRefresh();
        stopSteps.current?.();
        stopSteps.current = null;
      }
    });
    return () => sub.remove();
  }, [demo, connected]);
  useEffect(() => () => stopSteps.current?.(), []);
  const collect = (id: string) => {
    const before = gameRef.current;
    const after = claim(before, id);
    if (after !== before) {
      setGame(after);
      setMessage(
        `Quest complete! +${after.xp - before.xp} XP and +${after.coins - before.coins} coins.`,
      );
      if (Platform.OS !== "web")
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
    }
  };
  const pickPhoto = async (camera: boolean) => {
    if (camera && Platform.OS !== "web") {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted)
        throw new Error(
          "Camera access was declined. You can choose a photo instead.",
        );
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    };
    const result = camera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (!result.canceled) {
      const asset = result.assets[0];
      if ((asset.fileSize ?? 0) > 8 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 8 MB.");
      setPhoto(asset);
      setConsent(false);
    }
  };
  const signIn = async () => {
    if (!supabase)
      throw new Error(
        "The app backend is not connected yet. The README includes the Supabase setup. You can explore the full game in demo mode now.",
      );
    if (signup) {
      if (!/^[a-z0-9_]{3,24}$/.test(handle))
        throw new Error(
          "Use a handle with 3–24 lowercase letters, numbers, or underscores.",
        );
      if (displayName.trim().length < 1)
        throw new Error("Enter your display name.");
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim(), handle } },
      });
      if (error) throw error;
      if (!data.session) {
        setMessage(
          "Check your email to confirm your account, then sign in here.",
        );
        setSignup(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    }
    setPassword("");
    setDialog(null);
    setDemo(false);
    setMessage(
      "You’re signed in. Connect your steps to start your real journey.",
    );
  };
  const visibleFriends = demo
    ? DEMO_FRIENDS
    : friends.filter((f) => f.status === "accepted");
  const board = [
    ...visibleFriends,
    {
      id: "you",
      name: game.name === "Walker" ? "You" : game.name,
      handle: "you",
      steps: game.today.steps,
      goal: game.today.goal,
      atlas,
    },
  ].sort((a, b) => progress(b.steps, b.goal) - progress(a.steps, a.goal));
  const rank = board.findIndex((f) => f.id === "you") + 1;
  const openGoal = () => {
    setGoalInput(String(game.nextGoal));
    setDialog("goal");
  };
  const Header = () => (
    <View style={s.pageHeader}>
      <View>
        <Txt style={s.eyebrow}>
          {new Date()
            .toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })
            .toUpperCase()}
        </Txt>
        <Txt style={[s.title, !medium && { fontSize: 30 }]}>
          {tab === "Today"
            ? "Small steps. Big energy."
            : tab === "My avatar"
              ? "Your next version."
              : tab === "Friends"
                ? "Better, together."
                : "Look how far you’ve come."}
        </Txt>
        <Txt style={s.sub}>
          {tab === "Today"
            ? "Your daily adventure starts with a single step."
            : tab === "My avatar"
              ? "A familiar face. A fresh challenge. Every single day."
              : tab === "Friends"
                ? "Different goals. The same reason to keep moving."
                : "One day at a time adds up to something good."}
        </Txt>
      </View>
      {wide && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={() => setDialog("auth")}
          style={s.profile}
        >
          <UserRound size={19} color={C.green} />
          <Txt style={{ fontWeight: "600" }}>
            {session ? "My account" : "Sign in"}
          </Txt>
        </Pressable>
      )}
    </View>
  );
  return (
    <SafeAreaView style={s.root} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={s.app}>
        {wide && (
          <View style={s.sidebar}>
            <View style={s.brand}>
              <View style={s.brandIcon}>
                <Footprints color={C.lime} size={23} />
              </View>
              <Txt style={s.brandName}>
                stride<Txt style={{ color: "#88a843", fontSize: 32 }}>.</Txt>
              </Txt>
            </View>
            <Txt
              style={[
                s.eyebrow,
                { marginTop: 47, marginBottom: 17, marginLeft: 14 },
              ]}
            >
              YOUR EVERYDAY ADVENTURE
            </Txt>
            {tabs.map((t) => (
              <Pressable
                key={t.name}
                accessibilityRole="button"
                onPress={() => setTab(t.name)}
                style={[s.nav, tab === t.name && s.navActive]}
              >
                <t.icon size={20} color={tab === t.name ? C.green : C.muted} />
                <Txt
                  style={[
                    s.navText,
                    tab === t.name && { color: C.green, fontWeight: "700" },
                  ]}
                >
                  {t.name}
                </Txt>
                {t.name === "Friends" && (
                  <View style={s.count}>
                    <Txt style={{ fontSize: 11 }}>{visibleFriends.length}</Txt>
                  </View>
                )}
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <View style={s.sideNote}>
              <Leaf size={22} color={C.green} />
              <Txt style={{ fontWeight: "700", fontSize: 16, marginTop: 13 }}>
                A little more outside.
              </Txt>
              <Txt
                style={[s.sub, { fontSize: 12, lineHeight: 19, marginTop: 7 }]}
              >
                A little more you. Make room for a walk today.
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDialog("help")}
              style={s.nav}
            >
              <CircleHelp size={18} color={C.muted} />
              <Txt style={s.navText}>How Stride works</Txt>
            </Pressable>
            <View style={s.sidebarFooter}>
              <View style={s.miniProfile}>
                <UserRound color={C.green} size={19} />
              </View>
              <View>
                <Txt style={{ fontWeight: "700" }}>{game.name}</Txt>
                <Txt style={{ fontSize: 11, color: C.muted }}>
                  Level {level} · {demo ? "Demo adventurer" : "Adventurer"}
                </Txt>
              </View>
            </View>
          </View>
        )}
        <View style={s.main}>
          {!wide && (
            <View style={s.mobileTop}>
              <View style={s.brand}>
                <Footprints color={C.green} size={25} />
                <Txt style={[s.brandName, { fontSize: 25 }]}>stride.</Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Account"
                onPress={() => setDialog("auth")}
              >
                <UserRound size={22} color={C.green} />
              </Pressable>
            </View>
          )}
          <ScrollView
            contentContainerStyle={[
              s.content,
              !wide && { padding: 20, paddingBottom: 105 },
            ]}
          >
            <Header />
            <View style={s.modeRow}>
              <View style={s.row}>
                <View
                  style={[
                    s.dot,
                    {
                      backgroundColor: demo
                        ? "#b39b60"
                        : connected
                          ? "#6e9a53"
                          : "#a8aea3",
                    },
                  ]}
                />
                <Txt style={s.modeText}>
                  {demo
                    ? "DEMO PLAYGROUND"
                    : connected
                      ? "STEPS CONNECTED"
                      : "READY TO CONNECT"}
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDemo(!demo);
                  setPreviewStage(null);
                }}
              >
                <Txt style={s.link}>
                  {demo ? "Use my real steps ↗" : "Explore demo ↗"}
                </Txt>
              </Pressable>
            </View>
            {message !== "" && (
              <View accessibilityRole="alert" style={s.notice}>
                <Txt style={{ flex: 1, fontSize: 13, lineHeight: 20 }}>
                  {message}
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                  onPress={() => setMessage("")}
                >
                  <X color={C.green} size={18} />
                </Pressable>
              </View>
            )}
            {!loaded ? (
              <Txt>Loading your journey…</Txt>
            ) : (
              <>
                {tab === "Today" && (
                  <>
                    <View
                      style={[
                        s.dashboard,
                        !medium && { flexDirection: "column" },
                      ]}
                    >
                      <View style={s.leftCol}>
                        <LinearGradient
                          colors={["#2b4e3b", "#193b2d"]}
                          style={s.goalCard}
                        >
                          <View style={s.between}>
                            <View style={s.row}>
                              <Footprints color={C.lime} size={21} />
                              <Txt style={s.lightLabel}>TODAY’S STEPS</Txt>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Edit daily goal"
                              onPress={openGoal}
                            >
                              <Settings2 size={19} color="#cbd9c7" />
                            </Pressable>
                          </View>
                          <View
                            style={[
                              s.row,
                              { alignItems: "baseline", marginTop: 25 },
                            ]}
                          >
                            <Txt style={s.stepNumber}>
                              {fmt(game.today.steps)}
                            </Txt>
                            <Txt style={{ color: "#a8bfae", fontSize: 17 }}>
                              / {fmt(game.today.goal)}
                            </Txt>
                          </View>
                          <View
                            style={[
                              s.between,
                              { marginTop: 18, marginBottom: 12 },
                            ]}
                          >
                            <Txt style={{ color: "#cedcca", fontSize: 12 }}>
                              {currentProgress === 1
                                ? "Your daily goal, done. Nice work."
                                : `${fmt(Math.max(0, game.today.goal - game.today.steps))} steps to your peak form`}
                            </Txt>
                            <Txt style={{ color: C.lime, fontWeight: "700" }}>
                              {Math.round(currentProgress * 100)}%
                            </Txt>
                          </View>
                          <Bar value={currentProgress} dark />
                          <View style={s.goalStats}>
                            <View>
                              <Txt style={s.lightMetric}>
                                {(game.today.steps * 0.0007).toFixed(1)}{" "}
                                <Txt style={s.lightUnit}>km</Txt>
                              </Txt>
                              <Txt style={s.lightSmall}>Estimated distance</Txt>
                            </View>
                            <View style={s.statDivider} />
                            <View>
                              <Txt style={s.lightMetric}>
                                {Math.round(game.today.steps / 100)}{" "}
                                <Txt style={s.lightUnit}>min</Txt>
                              </Txt>
                              <Txt style={s.lightSmall}>Estimated walking</Txt>
                            </View>
                            <View style={s.statDivider} />
                            <View>
                              <Txt style={s.lightMetric}>
                                {stage + 1}
                                <Txt style={s.lightUnit}> / 6</Txt>
                              </Txt>
                              <Txt style={s.lightSmall}>Avatar stage</Txt>
                            </View>
                          </View>
                          {!demo && (
                            <View style={{ marginTop: 18 }}>
                              <Button
                                label={
                                  busy
                                    ? "Connecting…"
                                    : connected
                                      ? "Sync steps"
                                      : Platform.OS === "ios"
                                        ? "Connect Apple Health"
                                        : "Connect steps"
                                }
                                icon={RefreshCw}
                                onPress={() => void work(startTracking)}
                                quiet
                                disabled={busy}
                              />
                            </View>
                          )}
                        </LinearGradient>
                        <View style={s.miniStats}>
                          <View style={s.miniCard}>
                            <View
                              style={[
                                s.statIcon,
                                { backgroundColor: "#fff1e5" },
                              ]}
                            >
                              <Flame size={20} color="#b86c2d" />
                            </View>
                            <Txt style={s.metric}>
                              {streak(game)}{" "}
                              <Txt style={s.metricUnit}>days</Txt>
                            </Txt>
                            <Txt style={s.subSmall}>Current streak</Txt>
                          </View>
                          <View style={s.miniCard}>
                            <View
                              style={[
                                s.statIcon,
                                { backgroundColor: "#edf0dc" },
                              ]}
                            >
                              <Zap size={20} color="#7e8844" />
                            </View>
                            <Txt style={s.metric}>
                              {fmt(game.xp)} <Txt style={s.metricUnit}>XP</Txt>
                            </Txt>
                            <Txt style={s.subSmall}>
                              Earned, one step at a time
                            </Txt>
                          </View>
                        </View>
                        <View style={s.questCard}>
                          <View style={s.sectionTitle}>
                            <Txt style={s.h2}>A little quest for today</Txt>
                            <Tag>{game.today.claimed.length}/3</Tag>
                          </View>
                          {QUESTS.map((q, i) => {
                            const done = game.today.claimed.includes(q.id),
                              ready = currentProgress >= q.fraction;
                            return (
                              <View
                                key={q.id}
                                style={[
                                  s.questRow,
                                  i > 0 && {
                                    borderTopWidth: 1,
                                    borderTopColor: C.line,
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    s.questIcon,
                                    done && { backgroundColor: C.green },
                                  ]}
                                >
                                  {done ? (
                                    <Check size={18} color={C.lime} />
                                  ) : i === 2 ? (
                                    <Trophy size={19} color={C.green} />
                                  ) : (
                                    <Footprints size={19} color={C.green} />
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Txt style={s.questName}>{q.title}</Txt>
                                  <Txt style={s.subSmall}>{q.subtitle}</Txt>
                                </View>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    done
                                      ? `${q.title} claimed`
                                      : `Claim ${q.title}`
                                  }
                                  disabled={!ready || done}
                                  onPress={() => collect(q.id)}
                                  style={[
                                    s.reward,
                                    ready &&
                                      !done && { backgroundColor: C.lime },
                                  ]}
                                >
                                  <Txt
                                    style={{
                                      fontSize: 11,
                                      fontWeight: "700",
                                      color: done ? C.muted : C.green,
                                    }}
                                  >
                                    {done
                                      ? "Claimed"
                                      : ready
                                        ? "Claim"
                                        : `+${q.xp} XP`}
                                  </Txt>
                                </Pressable>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                      <View style={s.rightCol}>
                        <View style={s.avatarCard}>
                          <View style={s.between}>
                            <View>
                              <Txt style={s.eyebrow}>YOUR DAILY EVOLUTION</Txt>
                              <Txt style={[s.h2, { marginTop: 7 }]}>
                                {STAGES[stage]}
                              </Txt>
                            </View>
                            <Tag>LVL {level}</Tag>
                          </View>
                          <View style={s.avatarStage}>
                            <Avatar
                              stage={stage}
                              size={medium ? 300 : Math.min(width - 86, 340)}
                              uri={atlas}
                            />
                            {currentProgress === 1 && (
                              <View style={s.peakBadge}>
                                <Trophy size={16} color={C.green} />
                                <Txt
                                  style={{ fontWeight: "700", fontSize: 12 }}
                                >
                                  Peak form unlocked
                                </Txt>
                              </View>
                            )}
                          </View>
                          <View style={s.stages}>
                            {STAGES.map((label, i) => (
                              <View
                                key={label}
                                style={[
                                  s.stageDot,
                                  i <= stage && { backgroundColor: C.green },
                                  i === stage && { width: 24 },
                                ]}
                              />
                            ))}
                          </View>
                          <Txt style={s.avatarCaption}>
                            Every step brings out a new you.
                          </Txt>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setTab("My avatar")}
                            style={s.avatarLink}
                          >
                            <Camera size={16} color={C.green} />
                            <Txt style={s.link}>
                              {game.atlas
                                ? "Manage your avatar"
                                : "Make it look like you"}
                            </Txt>
                            <ChevronRight size={15} color={C.green} />
                          </Pressable>
                        </View>
                        <View style={s.friendsCard}>
                          <View style={s.sectionTitle}>
                            <View style={s.row}>
                              <Users size={19} color={C.green} />
                              <Txt style={s.h2}>Your walking crew</Txt>
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="View friends"
                              onPress={() => setTab("Friends")}
                            >
                              <ArrowUpRight size={20} color={C.green} />
                            </Pressable>
                          </View>
                          <Txt style={[s.subSmall, { marginBottom: 17 }]}>
                            {demo
                              ? "Sample crew · see how the leaderboard feels"
                              : visibleFriends.length
                                ? `You’re #${rank} in your crew today.`
                                : "Invite your first friend and grow together."}
                          </Txt>
                          {board.slice(0, 3).map((f, i) => (
                            <View key={f.id} style={s.friendMini}>
                              <Txt
                                style={{
                                  width: 20,
                                  fontSize: 12,
                                  color: C.muted,
                                }}
                              >
                                {i + 1}
                              </Txt>
                              <View style={s.miniProfile}>
                                <Txt
                                  style={{ fontWeight: "700", color: C.green }}
                                >
                                  {f.name[0]}
                                </Txt>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Txt
                                  style={{ fontWeight: "600", fontSize: 13 }}
                                >
                                  {f.id === "you" ? "You" : f.name}
                                </Txt>
                                <Txt style={s.subSmall}>
                                  {f.steps >= f.goal
                                    ? "Peak form unlocked"
                                    : STAGES[stageFor(f.steps, f.goal)]}
                                </Txt>
                              </View>
                              <Txt style={{ fontWeight: "700", fontSize: 12 }}>
                                {Math.round(progress(f.steps, f.goal) * 100)}%
                              </Txt>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                    {demo && (
                      <View
                        style={[
                          s.demoCard,
                          !medium && {
                            alignItems: "stretch",
                            flexDirection: "column",
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={s.row}>
                            <Sparkles size={19} color={C.green} />
                            <Txt style={{ fontWeight: "700" }}>
                              Take it for a test walk
                            </Txt>
                          </View>
                          <Txt style={[s.subSmall, { marginTop: 6 }]}>
                            Simulated steps stay in this playground. Watch your
                            avatar transform.
                          </Txt>
                        </View>
                        <View style={[s.row, { flexWrap: "wrap" }]}>
                          <Button
                            label="+500 steps"
                            quiet
                            onPress={() =>
                              setGame((g) =>
                                setSteps(
                                  g,
                                  Math.min(150000, g.today.steps + 500),
                                ),
                              )
                            }
                          />
                          <Button
                            label="+2,000 steps"
                            onPress={() =>
                              setGame((g) =>
                                setSteps(
                                  g,
                                  Math.min(150000, g.today.steps + 2000),
                                ),
                              )
                            }
                          />
                        </View>
                      </View>
                    )}
                    <View style={s.footerNote}>
                      <Leaf size={14} color={C.muted} />
                      <Txt
                        style={{ fontSize: 11, color: C.muted, flexShrink: 1 }}
                      >
                        A playful avatar journey. Your real body doesn’t change
                        with a daily step counter.
                      </Txt>
                    </View>
                  </>
                )}
                {tab === "My avatar" && (
                  <View
                    style={[
                      s.dashboard,
                      !medium && { flexDirection: "column" },
                    ]}
                  >
                    <View
                      style={[s.avatarCard, { flex: 1, alignItems: "center" }]}
                    >
                      <View style={[s.between, { width: "100%" }]}>
                        <Tag>
                          {previewStage === null
                            ? "YOUR CURRENT FORM"
                            : "TRANSFORMATION PREVIEW"}
                        </Tag>
                        <Tag>{(previewStage ?? stage) + 1} / 6</Tag>
                      </View>
                      <View style={{ marginTop: 20 }}>
                        <Avatar
                          stage={previewStage ?? stage}
                          size={Math.min(width - 90, 390)}
                          uri={atlas}
                        />
                      </View>
                      <Txt style={[s.h2, { marginTop: 20 }]}>
                        {STAGES[previewStage ?? stage]}
                      </Txt>
                      <View
                        style={[
                          s.row,
                          {
                            marginVertical: 20,
                            flexWrap: "wrap",
                            justifyContent: "center",
                          },
                        ]}
                      >
                        {STAGES.map((label, i) => (
                          <Pressable
                            key={label}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview stage ${i + 1}: ${label}`}
                            onPress={() => setPreviewStage(i)}
                            style={[
                              s.stageButton,
                              (previewStage ?? stage) === i && {
                                backgroundColor: C.green,
                              },
                            ]}
                          >
                            <Txt
                              style={{
                                color:
                                  (previewStage ?? stage) === i
                                    ? C.white
                                    : C.green,
                                fontWeight: "700",
                              }}
                            >
                              {i + 1}
                            </Txt>
                          </Pressable>
                        ))}
                      </View>
                      {previewStage !== null && (
                        <Button
                          label="Back to my progress"
                          quiet
                          onPress={() => setPreviewStage(null)}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 20 }}>
                      <View style={s.card}>
                        <View style={s.statIcon}>
                          <Camera color={C.green} size={22} />
                        </View>
                        <Txt style={[s.h2, { fontSize: 26, marginTop: 17 }]}>
                          Same face. New game.
                        </Txt>
                        <Txt style={[s.sub, { marginTop: 12, lineHeight: 24 }]}>
                          Take a selfie to create a realistic game version of
                          you. Your avatar begins with an exaggerated, larger
                          body and evolves through six forms as you walk.
                        </Txt>
                        <View style={{ marginTop: 24 }}>
                          <Button
                            label={
                              game.atlas
                                ? "Create a new avatar"
                                : "Create my avatar"
                            }
                            icon={Camera}
                            onPress={() => setDialog("camera")}
                          />
                        </View>
                        <Txt
                          style={[
                            s.subSmall,
                            { marginTop: 12, lineHeight: 20 },
                          ]}
                        >
                          Use a clear, front-facing photo of yourself. Your
                          selfie is processed only when you choose to generate.
                        </Txt>
                      </View>
                      <View style={s.card}>
                        <Txt style={s.h2}>A fresh start, every day</Txt>
                        {[
                          [
                            "01",
                            "Set your own pace",
                            "Choose a daily walking goal that works for you.",
                          ],
                          [
                            "02",
                            "Watch yourself evolve",
                            "Each 20% of your goal reveals a new avatar stage.",
                          ],
                          [
                            "03",
                            "Keep what you’ve earned",
                            "Your form resets daily. Your XP, coins, and streak stay.",
                          ],
                        ].map(([n, title, copy]) => (
                          <View
                            key={n}
                            style={[
                              s.row,
                              { alignItems: "flex-start", marginTop: 24 },
                            ]}
                          >
                            <Txt
                              style={{
                                color: "#9fac8e",
                                fontSize: 20,
                                fontWeight: "700",
                                width: 30,
                              }}
                            >
                              {n}
                            </Txt>
                            <View style={{ flex: 1 }}>
                              <Txt style={{ fontWeight: "700" }}>{title}</Txt>
                              <Txt
                                style={[
                                  s.subSmall,
                                  { lineHeight: 20, marginTop: 5 },
                                ]}
                              >
                                {copy}
                              </Txt>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
                {tab === "Friends" && (
                  <>
                    <View
                      style={[s.card, s.between, { flexWrap: "wrap", gap: 14 }]}
                    >
                      <View>
                        <Txt style={s.h2}>
                          {demo
                            ? "Meet the sample crew"
                            : "Your crew, your motivation"}
                        </Txt>
                        <Txt style={[s.subSmall, { marginTop: 7 }]}>
                          Ranked by progress toward each person’s own goal.
                        </Txt>
                      </View>
                      <Button
                        label="Add a friend"
                        icon={Plus}
                        onPress={() =>
                          setDialog(session && !demo ? "friend" : "auth")
                        }
                      />
                    </View>
                    {!demo &&
                      friends
                        .filter((f) => f.status === "pending")
                        .map((f) => (
                          <View
                            key={f.id}
                            style={[s.card, s.between, { marginTop: 15 }]}
                          >
                            <Txt>
                              {f.name} ·{" "}
                              {f.requester === session?.user.id
                                ? "Request sent"
                                : "Wants to join your crew"}
                            </Txt>
                            {f.requester !== session?.user.id && (
                              <Button
                                label={`Accept ${f.name}`}
                                onPress={() =>
                                  void work(async () => {
                                    await acceptFriend(f.id);
                                    setFriends(await getFriends());
                                  })
                                }
                              />
                            )}
                          </View>
                        ))}
                    <View style={s.crewGrid}>
                      {board.map((f, i) => (
                        <View
                          key={f.id}
                          style={[s.crewCard, { minWidth: medium ? 230 : 250 }]}
                        >
                          <View style={s.between}>
                            <Tag>#{i + 1} TODAY</Tag>
                            {f.id === "you" && <Tag>YOU</Tag>}
                          </View>
                          <View
                            style={{ alignItems: "center", marginVertical: 20 }}
                          >
                            <Avatar
                              stage={stageFor(f.steps, f.goal)}
                              size={210}
                              uri={f.atlas}
                            />
                          </View>
                          <Txt style={s.h2}>{f.name}</Txt>
                          <Txt
                            style={[
                              s.subSmall,
                              { marginTop: 4, marginBottom: 18 },
                            ]}
                          >
                            @{f.handle}
                          </Txt>
                          <Bar value={progress(f.steps, f.goal)} />
                          <View style={[s.between, { marginTop: 12 }]}>
                            <Txt style={{ fontSize: 12, fontWeight: "600" }}>
                              {fmt(f.steps)} steps
                            </Txt>
                            <Txt style={s.subSmall}>
                              {Math.round(progress(f.steps, f.goal) * 100)}%
                            </Txt>
                          </View>
                          {!demo && f.id !== "you" && (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                void work(async () => {
                                  await removeFriend(f.id);
                                  setFriends(await getFriends());
                                })
                              }
                              style={{ marginTop: 20 }}
                            >
                              <Txt style={s.subSmall}>Remove friend</Txt>
                            </Pressable>
                          )}
                        </View>
                      ))}
                    </View>
                    <View style={[s.card, s.row, { marginTop: 20 }]}>
                      <ShieldCheck size={24} color={C.green} />
                      <Txt style={[s.subSmall, { flex: 1, lineHeight: 21 }]}>
                        {demo
                          ? "These are fictional sample players. Sign in to invite real friends."
                          : "Only accepted friends can see your avatar and walking progress. Raw selfies are never shared with friends."}
                      </Txt>
                    </View>
                  </>
                )}
                {tab === "Journey" && (
                  <>
                    <View style={[s.miniStats, { marginTop: 0 }]}>
                      <View style={s.miniCard}>
                        <Flame color="#b86c2d" />
                        <Txt style={s.metric}>{streak(game)}</Txt>
                        <Txt style={s.subSmall}>Day streak</Txt>
                      </View>
                      <View style={s.miniCard}>
                        <Zap color={C.green} />
                        <Txt style={s.metric}>{fmt(game.xp)}</Txt>
                        <Txt style={s.subSmall}>
                          Lifetime XP · level {level}
                        </Txt>
                      </View>
                      <View style={s.miniCard}>
                        <Trophy color="#9e8137" />
                        <Txt style={s.metric}>{fmt(game.coins)}</Txt>
                        <Txt style={s.subSmall}>Coins earned</Txt>
                      </View>
                    </View>
                    <View style={[s.card, { marginTop: 20 }]}>
                      <Txt style={s.h2}>Your walking journal</Txt>
                      <Txt style={[s.sub, { marginTop: 8, marginBottom: 25 }]}>
                        Every walk deserves a place in your story.
                      </Txt>
                      {[game.today, ...[...game.history].reverse()].map(
                        (day) => (
                          <View key={day.date} style={s.journalRow}>
                            <View style={s.questIcon}>
                              {day.steps >= day.goal ? (
                                <Check size={19} color={C.green} />
                              ) : (
                                <Footprints size={19} color={C.green} />
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Txt style={{ fontWeight: "600" }}>
                                {day.date === localDate()
                                  ? "Today"
                                  : new Date(
                                      `${day.date}T12:00:00`,
                                    ).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    })}
                              </Txt>
                              <Txt style={s.subSmall}>
                                {day.steps >= day.goal
                                  ? "Peak form reached"
                                  : STAGES[stageFor(day.steps, day.goal)]}{" "}
                                ·{" "}
                                {day.source === "demo"
                                  ? "Demo steps"
                                  : day.source === "apple-health"
                                    ? "Apple Health steps"
                                    : "Phone steps"}
                              </Txt>
                            </View>
                            <Txt style={{ fontWeight: "700" }}>
                              {fmt(day.steps)}{" "}
                              <Txt style={s.subSmall}>/ {fmt(day.goal)}</Txt>
                            </Txt>
                          </View>
                        ),
                      )}
                    </View>
                    {demo && (
                      <View style={[s.card, { marginTop: 20 }]}>
                        <Txt style={s.h2}>Start a fresh demo</Txt>
                        <Txt
                          style={[
                            s.subSmall,
                            { marginTop: 8, marginBottom: 18 },
                          ]}
                        >
                          Clear the sample progress and see the transformation
                          from the beginning.
                        </Txt>
                        <Button
                          label="Reset demo"
                          quiet
                          onPress={() => {
                            setGame(createGame());
                            setMessage(
                              "The demo is reset. Your real walking progress is separate.",
                            );
                          }}
                        />
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
          {!wide && (
            <View style={s.bottomNav}>
              {tabs.map((t) => (
                <Pressable
                  key={t.name}
                  accessibilityRole="button"
                  onPress={() => setTab(t.name)}
                  style={s.bottomTab}
                >
                  <t.icon
                    size={21}
                    color={tab === t.name ? C.green : "#9da497"}
                  />
                  <Txt
                    style={{
                      fontSize: 10,
                      fontWeight: tab === t.name ? "700" : "400",
                      color: tab === t.name ? C.green : C.muted,
                    }}
                  >
                    {t.name}
                  </Txt>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
      <Modal
        visible={dialog !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setDialog(null)}
      >
        <View style={s.overlay}>
          <ScrollView contentContainerStyle={s.modalScroller}>
            <View style={s.modal}>
              <View style={s.between}>
                <Txt style={s.h2}>
                  {dialog === "goal"
                    ? "Your daily goal"
                    : dialog === "camera"
                      ? "Create your avatar"
                      : dialog === "friend"
                        ? "Grow your walking crew"
                        : dialog === "help"
                          ? "Welcome to Stride"
                          : session
                            ? "Your account"
                            : signup
                              ? "Start your journey"
                              : "Welcome back"}
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                  onPress={() => setDialog(null)}
                >
                  <X size={21} color={C.green} />
                </Pressable>
              </View>
              {dialog === "goal" && (
                <>
                  <Txt style={[s.sub, { marginVertical: 20 }]}>
                    A goal that fits your day. Choose between 1,000 and 50,000
                    steps.
                  </Txt>
                  <TextInput
                    accessibilityLabel="Daily step goal"
                    keyboardType="number-pad"
                    value={goalInput}
                    onChangeText={setGoalInput}
                    style={[s.input, { fontSize: 28, fontWeight: "700" }]}
                  />
                  <View style={[s.row, { flexWrap: "wrap", marginBottom: 20 }]}>
                    {[5000, 8000, 10000, 15000].map((n) => (
                      <Button
                        key={n}
                        label={fmt(n)}
                        quiet
                        onPress={() => setGoalInput(String(n))}
                      />
                    ))}
                  </View>
                  <Button
                    label="Save goal"
                    onPress={() => {
                      try {
                        const updated = changeGoal(game, Number(goalInput));
                        setGame(updated);
                        setDialog(null);
                        setMessage(
                          game.today.steps > 0
                            ? "Your new goal starts tomorrow. Today’s challenge stays the same."
                            : "Your daily goal is set. Let’s go.",
                        );
                      } catch (e) {
                        showError(e);
                      }
                    }}
                  />
                  <Txt style={[s.subSmall, { marginTop: 15, lineHeight: 19 }]}>
                    Once your first steps are recorded, changes apply to
                    tomorrow.
                  </Txt>
                </>
              )}
              {dialog === "camera" && (
                <>
                  <Txt style={[s.sub, { marginVertical: 20, lineHeight: 23 }]}>
                    A clear selfie becomes six realistic versions of your game
                    character.
                  </Txt>
                  {photo && (
                    <Image
                      source={{ uri: photo.uri }}
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: 20,
                        alignSelf: "center",
                        marginBottom: 20,
                      }}
                    />
                  )}
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    <Button
                      label="Take a selfie"
                      icon={Camera}
                      onPress={() => void work(() => pickPhoto(true))}
                      disabled={busy}
                    />
                    <Button
                      label="Choose photo"
                      quiet
                      onPress={() => void work(() => pickPhoto(false))}
                      disabled={busy}
                    />
                  </View>
                  <View
                    style={[
                      s.row,
                      { marginVertical: 22, alignItems: "flex-start" },
                    ]}
                  >
                    <Switch
                      accessibilityLabel="Allow processing my selfie"
                      value={consent}
                      onValueChange={setConsent}
                      trackColor={{ true: C.green }}
                    />
                    <Txt style={[s.subSmall, { flex: 1, lineHeight: 20 }]}>
                      This is my photo. I agree to send it to the avatar service
                      to create my game character. The original selfie is not
                      stored by Stride or shared with friends. The image
                      provider may retain it under its data policy.
                    </Txt>
                  </View>
                  <Button
                    label={
                      busy ? "Creating your avatar…" : "Generate my avatar"
                    }
                    icon={Sparkles}
                    disabled={busy || !photo || !consent || demo || !session}
                    onPress={() =>
                      void work(async () => {
                        if (!photo?.base64)
                          throw new Error(
                            "Choose the photo again so it can be processed.",
                          );
                        const generation = scope.current;
                        const path = await generateAvatar(
                          photo.base64,
                          photo.mimeType ?? "image/jpeg",
                        );
                        if (scope.current !== generation) return;
                        setGame((g) => ({ ...g, atlas: path }));
                        setPhoto(null);
                        setConsent(false);
                        setDialog(null);
                        setMessage(
                          "Your avatar is ready. Take your next step.",
                        );
                      })
                    }
                  />
                  {(!session || demo) && (
                    <Txt
                      style={[s.subSmall, { marginTop: 12, lineHeight: 20 }]}
                    >
                      Personal generation is available after signing in and
                      leaving demo mode. The starter avatar works immediately.
                    </Txt>
                  )}
                  {game.atlas && (
                    <View style={{ marginTop: 20 }}>
                      <Button
                        label="Delete my generated avatar"
                        quiet
                        onPress={() =>
                          void work(async () => {
                            const { error } =
                              await supabase!.functions.invoke("delete-avatar");
                            if (error) throw error;
                            setGame((g) => ({ ...g, atlas: undefined }));
                            setAtlas(undefined);
                            setMessage("Your generated avatar was deleted.");
                            setDialog(null);
                          })
                        }
                      />
                    </View>
                  )}
                </>
              )}
              {dialog === "friend" && (
                <>
                  <Txt style={[s.sub, { marginVertical: 20 }]}>
                    Add their exact Stride handle. They’ll need to accept before
                    you can see each other’s progress.
                  </Txt>
                  <TextInput
                    accessibilityLabel="Friend handle"
                    placeholder="their_handle"
                    autoCapitalize="none"
                    value={friendHandle}
                    onChangeText={setFriendHandle}
                    style={s.input}
                  />
                  <Button
                    label={busy ? "Sending…" : "Send friend request"}
                    icon={Plus}
                    disabled={busy}
                    onPress={() =>
                      void work(async () => {
                        await requestFriend(friendHandle);
                        setFriends(await getFriends());
                        setFriendHandle("");
                        setDialog(null);
                        setMessage("Friend request sent.");
                      })
                    }
                  />
                </>
              )}
              {dialog === "auth" &&
                (session ? (
                  <>
                    <Txt style={[s.sub, { marginVertical: 20 }]}>
                      {session.user.email}
                    </Txt>
                    <Txt style={[s.subSmall, { marginBottom: 20 }]}>
                      Your handle: @
                      {session.user.user_metadata.handle ?? "walker"}
                    </Txt>
                    <Button
                      label="Sign out"
                      icon={LogOut}
                      quiet
                      onPress={() =>
                        void work(async () => {
                          stopSteps.current?.();
                          const { error } = await supabase!.auth.signOut();
                          if (error) throw error;
                          setDemo(true);
                          setDialog(null);
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <Txt
                      style={[s.sub, { marginVertical: 20, lineHeight: 22 }]}
                    >
                      {backendReady
                        ? "Save your identity and walk with your friends."
                        : "You can try Stride in demo mode now. Account features turn on when the project’s backend is configured."}
                    </Txt>
                    {signup && (
                      <>
                        <TextInput
                          accessibilityLabel="Display name"
                          placeholder="Your name"
                          value={displayName}
                          onChangeText={setDisplayName}
                          style={s.input}
                        />
                        <TextInput
                          accessibilityLabel="Your handle"
                          placeholder="your_handle"
                          autoCapitalize="none"
                          value={handle}
                          onChangeText={setHandle}
                          style={s.input}
                        />
                      </>
                    )}
                    <TextInput
                      accessibilityLabel="Email"
                      placeholder="you@example.com"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                      style={s.input}
                    />
                    <TextInput
                      accessibilityLabel="Password"
                      placeholder="Password (at least 8 characters)"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                      style={s.input}
                    />
                    <Button
                      label={
                        busy
                          ? "One moment…"
                          : signup
                            ? "Create account"
                            : "Sign in"
                      }
                      disabled={busy || password.length < 8 || !email}
                      onPress={() => void work(signIn)}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSignup(!signup)}
                      style={{ marginTop: 20, alignItems: "center" }}
                    >
                      <Txt style={s.link}>
                        {signup
                          ? "Already have an account? Sign in"
                          : "New here? Create an account"}
                      </Txt>
                    </Pressable>
                  </>
                ))}
              {dialog === "help" && (
                <>
                  <Txt style={[s.sub, { marginVertical: 20, lineHeight: 25 }]}>
                    Choose your daily step goal. Your character begins in its
                    largest game form and transforms at 20%, 40%, 60%, 80%, and
                    100% of your goal. Claim quests for XP and coins. A new day
                    resets the character, while your rewards stay.
                  </Txt>
                  <Txt style={[s.sub, { lineHeight: 25 }]}>
                    On iPhone, Stride reads today’s steps from Apple Health,
                    including synced Apple Watch activity. Allow Steps access in
                    Health. On
                    Android, it reads Steps shared with Health Connect. Totals
                    refresh when the app is open or reopened. Browser steps are
                    always simulated.
                  </Txt>
                  <Txt style={[s.subSmall, { marginTop: 20, lineHeight: 21 }]}>
                    The transformation is a fictional game mechanic, not a
                    measurement of your body or health. Only accepted friends
                    can view your avatar and progress.
                  </Txt>
                </>
              )}
              {message !== "" && (
                <View
                  accessibilityRole="alert"
                  style={[s.notice, { marginTop: 20, marginBottom: 0 }]}
                >
                  <Txt style={{ fontSize: 12, lineHeight: 20, flex: 1 }}>
                    {message}
                  </Txt>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  text: {
    color: C.ink,
    fontSize: 14,
    fontFamily:
      Platform.OS === "ios"
        ? "Avenir Next"
        : Platform.OS === "web"
          ? "Inter, system-ui, -apple-system, sans-serif"
          : undefined,
  },
  app: { flex: 1, flexDirection: "row" },
  main: { flex: 1 },
  sidebar: {
    width: 234,
    backgroundColor: "#fbfcf8",
    borderRightWidth: 1,
    borderRightColor: C.line,
    paddingHorizontal: 23,
    paddingTop: 33,
    paddingBottom: 20,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontSize: 32, fontWeight: "800", letterSpacing: -1.3 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: C.muted,
  },
  nav: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 7,
  },
  navActive: { backgroundColor: "#e7eddc" },
  navText: { color: C.muted, fontSize: 13 },
  count: {
    marginLeft: "auto",
    backgroundColor: "#e1e8d5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  sideNote: {
    backgroundColor: "#eef2e5",
    padding: 20,
    borderRadius: 16,
    marginBottom: 25,
  },
  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 20,
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  miniProfile: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e6ecdf",
  },
  content: {
    padding: 36,
    paddingTop: 38,
    maxWidth: 1390,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 35,
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 15,
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.3,
    marginTop: 10,
    marginBottom: 9,
  },
  sub: { fontSize: 13, color: C.muted, lineHeight: 20 },
  profile: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    backgroundColor: C.white,
    padding: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 30,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modeText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    color: C.muted,
  },
  link: { fontSize: 12, color: C.green, fontWeight: "700" },
  dashboard: { flexDirection: "row", gap: 22 },
  leftCol: { flex: 1.2, gap: 20 },
  rightCol: { flex: 1, gap: 20 },
  goalCard: { borderRadius: 22, padding: 26 },
  lightLabel: {
    color: "#d8e4d1",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.6,
  },
  stepNumber: {
    fontSize: 55,
    fontWeight: "700",
    color: "#f4f6ed",
    letterSpacing: -2.7,
  },
  track: {
    height: 7,
    borderRadius: 8,
    backgroundColor: "#e7ecdf",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 8 },
  goalStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 26,
  },
  lightMetric: { fontSize: 21, fontWeight: "600", color: "#f4f6ed" },
  lightUnit: { fontSize: 11, color: "#b3c7b6", fontWeight: "400" },
  lightSmall: { fontSize: 9, color: "#b3c7b6", marginTop: 6 },
  statDivider: { width: 1, backgroundColor: "#496352" },
  miniStats: { flexDirection: "row", gap: 15 },
  miniCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    padding: 20,
  },
  statIcon: {
    backgroundColor: C.pale,
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  metric: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 15,
    marginBottom: 4,
    letterSpacing: -0.8,
  },
  metricUnit: { fontSize: 12, fontWeight: "400", color: C.muted },
  subSmall: { fontSize: 11, color: C.muted, lineHeight: 17 },
  questCard: {
    padding: 22,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  h2: { fontSize: 17, fontWeight: "700", letterSpacing: -0.4 },
  tag: {
    backgroundColor: "#edf1e6",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#5b735b",
  },
  questRow: {
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
    paddingVertical: 17,
  },
  questIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  questName: { fontSize: 12, fontWeight: "600", marginBottom: 3 },
  reward: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: "#f0f3e9",
  },
  avatarCard: {
    backgroundColor: "#edf0e5",
    borderWidth: 1,
    borderColor: "#e1e6d8",
    borderRadius: 22,
    padding: 24,
  },
  avatarStage: { alignItems: "center", marginTop: 19, position: "relative" },
  stages: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 18,
  },
  stageDot: {
    width: 7,
    height: 7,
    borderRadius: 6,
    backgroundColor: "#c4cdb7",
  },
  avatarCaption: {
    textAlign: "center",
    fontSize: 11,
    color: C.muted,
    marginTop: 14,
  },
  avatarLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 19,
  },
  friendsCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    padding: 23,
  },
  friendMini: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 9,
  },
  button: {
    backgroundColor: C.green,
    borderRadius: 11,
    paddingHorizontal: 17,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 43,
  },
  quiet: { backgroundColor: "#e9eedf" },
  buttonText: { color: C.white, fontSize: 12, fontWeight: "600" },
  demoCard: {
    backgroundColor: "#ecf0e4",
    borderWidth: 1,
    borderColor: "#dfe7d2",
    borderRadius: 17,
    padding: 20,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  notice: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    backgroundColor: "#eaf0df",
    borderWidth: 1,
    borderColor: "#d5e0c2",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  footerNote: {
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  card: {
    padding: 25,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    backgroundColor: C.white,
  },
  crewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20, marginTop: 20 },
  crewCard: {
    flex: 1,
    padding: 22,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
  },
  stageButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#dce4d0",
    alignItems: "center",
    justifyContent: "center",
  },
  journalRow: {
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    gap: 15,
    alignItems: "center",
  },
  mobileTop: {
    paddingHorizontal: 22,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fbfcf8",
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    paddingTop: 13,
    paddingBottom: 25,
  },
  bottomTab: { flex: 1, gap: 6, alignItems: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(16,34,23,.5)" },
  modalScroller: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  modal: {
    maxWidth: 460,
    width: "100%",
    backgroundColor: C.bg,
    borderRadius: 24,
    padding: 26,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontSize: 15,
    color: C.ink,
    marginBottom: 14,
  },
  peakBadge: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    position: "absolute",
    bottom: 12,
    backgroundColor: C.lime,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
