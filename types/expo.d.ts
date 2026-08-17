/// <reference types="expo/types" />

// Expo generates an identical reference into `expo-env.d.ts`, but that file is
// gitignored and only written when `expo start` or `expo export` runs. So a
// clean checkout — CI, or a colleague who has not started the dev server yet —
// typechecks without Expo's ambient types and fails inside `node_modules`:
// `phosphor-react-native` ships `.tsx` source rather than declarations, and
// `skipLibCheck` does not apply to source files, so its `className` prop is
// checked against react-native-svg and rejected.
//
// `exclude` does not prevent that. It filters the `include` globs; files
// reached through an import are compiled regardless.
//
// This file is ours rather than Expo's, so committing it does not contradict
// the "should not be edited" note in the generated one.
