import { StyleSheet, View, type ViewProps } from "react-native";
import { useAppTheme } from "@/theme/theme-provider";

type SurfaceProps = ViewProps & {
  muted?: boolean;
};

export function Surface({ style, muted = false, ...props }: SurfaceProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: muted ? colors.cardMuted : colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    shadowOffset: {
      width: 0,
      height: 18,
    },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 1,
  },
});
