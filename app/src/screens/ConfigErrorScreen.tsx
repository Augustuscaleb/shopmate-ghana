import { Notice, Screen } from '../ui/components';

export function ConfigErrorScreen({ problems }: { problems: string[] }) {
  return (
    <Screen title="Setup needed" subtitle="This build of the app is not configured correctly.">
      {problems.map((p) => <Notice key={p} tone="error" text={p} />)}
    </Screen>
  );
}
