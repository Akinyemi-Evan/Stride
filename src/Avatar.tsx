import React from "react";
import { Image, View } from "react-native";

/** 3 × 2 atlas keeps the face, clothes and camera consistent across six stages. */
export function Avatar({
  stage = 0,
  size = 320,
  uri,
}: {
  stage?: number;
  size?: number;
  uri?: string;
}) {
  const frame = Math.max(0, Math.min(5, Math.floor(stage)));
  return (
    <View
      accessibilityLabel={`Avatar transformation stage ${frame + 1} of 6`}
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        borderRadius: 24,
        backgroundColor: "#343830",
      }}
    >
      <Image
        source={uri ? { uri } : require("../assets/avatar-atlas.png")}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: size * 3,
          height: size * 2,
          left: -(frame % 3) * size,
          top: -Math.floor(frame / 3) * size,
        }}
      />
    </View>
  );
}
