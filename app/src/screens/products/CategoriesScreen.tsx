/**
 * Category management, opened from the S-30 category filter ("Manage categories") and the product
 * form. Add, rename, archive and restore. Categories are written directly under RLS (Stage 1A
 * grants); a duplicate name is refused by the unique index, and a category still used by an active
 * product can't be archived (D5). Nothing is deleted. Archiving asks first; restoring runs at once.
 * Stage 1C-3.3: redesigned on the v2 kit; behaviour and wording unchanged.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useFreshness } from '../../ui/useFreshness';
import { useLatestRequest } from '../../ui/useLatestRequest';
import { updatedLabel } from '../../lib/freshness';
import { FadeIn } from '../../ui/animated';
import {
  AppText, Banner, Button, Card, Divider, EmptyState, Notice, ScreenHeader, ScreenScaffold, SectionHeader, SkeletonRow, StatusBadge,
  TextAction, TextField, UpdatedLine, space,
} from '../../ui/kit';
import { TagIcon } from '../../ui/kit/icons';
import { useConnectivity } from '../../ui/useConnectivity';
import { checkCategoryName, outcomeTone } from '../../services/productForm';
import { ReadError, type Category, type ProductsService } from '../../services/products';

export function CategoriesScreen({ businessId, products, onBack, onChanged, visible }: {
  businessId: string;
  /** On screen (increment 2b: automatic refreshes only then). */
  visible: boolean;
  products: ProductsService;
  onBack: () => void;
  /** Tells the list behind this screen to reload its categories. */
  onChanged: () => void;
}) {
  const offline = useConnectivity() === 'offline';
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState<string | undefined>();
  /** `seenName`: the name shown when editing started (conflict-safe rename, increment 2b). */
  const [editing, setEditing] = useState<{ id: string; name: string; seenName: string; error?: string; note?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const shown = useRef<Category[] | null>(null);
  shown.current = categories;

  /** Stage 1C-3.1 (Review-2 finding 1): an older answer never replaces a newer one. */
  const reads = useLatestRequest();

  /**
   * Loads the list. If a list is already shown, a failed reload keeps it (with "couldn't refresh")
   * instead of replacing it with an error (increment 2b). The name being typed is never touched.
   */
  const load = async (): Promise<Category[] | null> => {
    setLoadError(null);
    setLastAttemptAt(Date.now());
    let latest: Category[] | null = null;
    await reads.run(() => products.listCategories(businessId, { includeArchived: true }), (list) => {
      latest = list;
      setCategories(list);
      setLoadedAt(new Date().toISOString());
      setRefreshFailed(false);
    }, (e) => {
      if (shown.current !== null) setRefreshFailed(true);
      else setLoadError(e instanceof ReadError ? e.message : "We couldn't load your categories. Please try again.");
    });
    // null when this read failed or a newer one replaced it (that newer read updates the screen)
    return latest;
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Increment 2b: when the app returns, when this screen is shown again, and every 15 minutes.
  // Not while a read is already running: it would only repeat it (Review-2 finding 3).
  useFreshness({ visible, lastLoadedAt: lastAttemptAt, busy: busy !== null, refresh: () => { if (!reads.running) load(); } });

  /** Another device renamed or archived this category meanwhile: show the latest list. */
  const conflicted = async (id: string, text: string) => {
    setMessage({ tone: 'info', text });
    onChanged();
    const list = await load();
    const now = list?.find((c) => c.id === id);
    setEditing((e) => {
      if (!e || e.id !== id) return e;
      // The read failed or a newer one replaced it: nothing is known yet, so keep the typing as it is
      if (list === null) return e;
      // Gone or archived: nothing left to rename. Renamed: keep the typing, show the new name.
      if (!now || now.archived) return null;
      return { ...e, seenName: now.name, error: undefined, note: `It is now called "${now.name}".` };
    });
  };

  const changed = (text: string) => { setMessage({ tone: 'success', text }); onChanged(); load(); };

  const add = async () => {
    setMessage(null);
    const c = checkCategoryName(newName);
    if (!c.ok) { setNewError(c.error); return; }
    setBusy('new');
    const res = await products.createCategory(businessId, c.value);
    setBusy(null);
    if (res.ok) { setNewName(''); changed(res.reconciled ? `${res.data.name} is saved in your categories.` : `${res.data.name} added`); }
    // Sent but unanswered: keep the name typed; trying again is safe (the add is read back)
    else if (res.kind === 'no_response') setMessage({ tone: 'info', text: res.message });
    else setNewError(res.message);
  };

  const rename = async () => {
    if (!editing) return;
    setMessage(null);
    const c = checkCategoryName(editing.name);
    if (!c.ok) { setEditing({ ...editing, error: c.error }); return; }
    setBusy(editing.id);
    const res = await products.renameCategory(businessId, editing.id, c.value, editing.seenName);
    setBusy(null);
    if (res.ok) { setEditing(null); changed(`Renamed to ${res.data.name}`); }
    else if (res.kind === 'conflict') conflicted(editing.id, res.message);
    else if (res.kind === 'no_response') setMessage({ tone: 'info', text: res.message });
    else setEditing({ ...editing, error: res.message });
  };

  const setArchived = (cat: Category, archived: boolean) => {
    const run = async () => {
      setMessage(null);
      setBusy(cat.id);
      const res = await products.setCategoryArchived(businessId, cat.id, archived, archived ? cat.name : undefined);
      setBusy(null);
      if (res.ok) changed(archived ? `${cat.name} archived` : `${cat.name} restored`);
      else if (res.kind === 'conflict') conflicted(cat.id, res.message);
      else setMessage({ tone: outcomeTone(res.kind), text: res.message });
    };
    if (!archived) { run(); return; }
    Alert.alert(`Archive ${cat.name}?`, 'It will no longer be offered for products. Nothing is deleted, and you can restore it later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: run },
    ]);
  };
  const active = (categories ?? []).filter((c) => !c.archived);
  const archived = (categories ?? []).filter((c) => c.archived);

  return (
    <ScreenScaffold keyboard width="form"
      header={<ScreenHeader title="Categories" subtitle="Group your products so they're quicker to find." onBack={onBack} />}
      banners={offline ? (
        <Banner tone="offline" message="You're offline. Saving changes needs internet; your typing is kept."
          action={{ label: 'Check again', onPress: () => { products.checkConnection(businessId).then((ok) => { if (ok) load(); }); } }} />
      ) : null}>
      <Card>
        <TextField label="New category" value={newName} placeholder="e.g. Drinks" maxLength={60} error={newError}
          onChangeText={(t) => { setNewName(t); setNewError(undefined); setMessage(null); }} />
        <Button label="Add category" onPress={add} busy={busy === 'new'} disabled={offline || busy !== null} />
      </Card>

      {message ? <Notice tone={message.tone} text={message.text} /> : null}
      {refreshFailed ? <UpdatedLine label={updatedLabel(loadedAt, new Date(), true) ?? ''} failed onRetry={() => { load(); }} /> : null}

      {loadError ? (
        <View style={styles.gap}><Banner tone="danger" message={loadError} /><Button label="Try again" kind="secondary" onPress={load} /></View>
      ) : categories === null ? <View style={styles.gapSm}>{[0, 1, 2].map((k) => <SkeletonRow key={k} />)}</View> : active.length === 0 && archived.length === 0 ? (
        <EmptyState icon={TagIcon} title="No categories yet" body="Add one above, for example Drinks, Provisions or Toiletries. Products don't need a category." />
      ) : (
        <FadeIn>
          <View style={styles.gap}>
            <SectionHeader title={`In use (${active.length})`} />
            {active.length === 0 ? <AppText variant="caption" tone="textSecondary">No active categories.</AppText> : null}
            {active.length > 0 ? (
              <Card padded={false}>
                {active.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 ? <Divider /> : null}
                    {editing?.id === c.id ? (
                      <View style={styles.editing}>
                        <TextField label="Category name" value={editing.name} maxLength={60} error={editing.error}
                          onChangeText={(t) => setEditing({ ...editing, name: t, error: undefined })} />
                        {editing.note ? <AppText variant="caption" tone="textSecondary">{editing.note}</AppText> : null}
                        <View style={styles.actions}>
                          <Button label="Save" onPress={rename} busy={busy === c.id} disabled={offline} />
                          <Button label="Cancel" kind="quiet" onPress={() => setEditing(null)} />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.row}>
                        <AppText variant="label" style={styles.name}>{c.name}</AppText>
                        <View style={styles.rowButtons}>
                          <TextAction label="Rename" accessibilityLabel={`Rename ${c.name}`} onPress={() => { setMessage(null); setEditing({ id: c.id, name: c.name, seenName: c.name }); }} disabled={offline || busy !== null} />
                          <TextAction label="Archive" tone="danger" accessibilityLabel={`Archive ${c.name}`} onPress={() => setArchived(c, true)} disabled={offline || busy !== null} />
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </Card>
            ) : null}
            {archived.length > 0 ? (
              <TextAction label={showArchived ? `Hide archived (${archived.length})` : `Show archived (${archived.length})`} onPress={() => setShowArchived((v) => !v)} />
            ) : null}
            {showArchived && archived.length > 0 ? (
              <Card padded={false}>
                {archived.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 ? <Divider /> : null}
                    <View style={styles.row}>
                      <View style={styles.name}>
                        <AppText variant="label" tone="textSecondary">{c.name}</AppText>
                        <StatusBadge label="Archived" tone="neutral" />
                      </View>
                      <TextAction label="Restore" accessibilityLabel={`Restore ${c.name}`} onPress={() => setArchived(c, false)} disabled={offline || busy !== null} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
          </View>
        </FadeIn>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  gapSm: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xxs, minHeight: 56 },
  name: { flexGrow: 1, flexShrink: 1, gap: 2, paddingVertical: space.xs },
  rowButtons: { flexDirection: 'row', gap: space.sm },
  editing: { padding: space.md, gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
