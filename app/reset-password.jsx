import { Redirect } from 'expo-router';

// The reset email links here. _layout shows the reset form when the link carries a token;
// without one (a refresh or a bookmark) there is nothing to do, so go home.
export default function ResetPasswordRoute() {
  return <Redirect href="/" />;
}
