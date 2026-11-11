import { Button, Screen } from '../ui/components';

/** S-01 Welcome */
export function WelcomeScreen({ onSignUp, onLogIn }: { onSignUp: () => void; onLogIn: () => void }) {
  return (
    <Screen title="ShopMate Ghana" subtitle="Your shop book, on your phone. Record sales, stock, customers who owe you, and see your profit.">
      <Button label="Create my shop account" onPress={onSignUp} />
      <Button label="I already have an account" kind="secondary" onPress={onLogIn} />
    </Screen>
  );
}
