import { Button, Notice, Screen } from '../ui/components';

export function CheckEmailScreen({ email, onDone }: { email: string; onDone: () => void }) {
  return (
    <Screen title="Check your email" subtitle={`We sent a confirmation link to ${email}. Open it on this phone to finish creating your account.`}>
      <Notice text="Can't find it? Check your spam or promotions folder. The link can only be used once." />
      <Button label="Go to log in" kind="secondary" onPress={onDone} />
    </Screen>
  );
}
