import { MagnifyingGlass, UsersThree, X } from '@/components/icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Container } from '@/components/Container';
import { EmptyState } from '@/components/EmptyState';
import { OrganizerCard } from '@/components/OrganizerCard';
import { Bone } from '@/components/Skeleton';
import { browseOrganizers, type OrganizerListing } from '@/lib/api';
import { useRemote } from '@/lib/useRemote';
import { minTouchTarget, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useTheme';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

function detailFor(o: OrganizerListing) {
  const bits = [o.upcoming > 0 ? plural(o.upcoming, 'event coming up', 'events coming up') : 'Nothing on right now'];
  if (o.followers > 0) bits.push(plural(o.followers, 'follower', 'followers'));
  if (o.rating != null) bits.push(`${o.rating.toFixed(1)} stars`);
  return bits.join(' · ');
}

// Every organiser with a listed event, so people can find who runs what
// without hunting through event pages.
export default function Organizers() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const load = useCallback(() => browseOrganizers(debounced), [debounced]);
  const { data, error, reload } = useRemote(load);

  const header = (
    <Container style={styles.head}>
      <View style={[styles.search, { backgroundColor: colors.surface }]}>
        <MagnifyingGlass size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search organisers"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search organisers"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="never"
          style={[styles.input, type.body, { color: colors.text }]}
        />
        {!!query && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
            <X size={16} color={colors.textMuted} weight="bold" />
          </Pressable>
        )}
      </View>
      <AppText variant="footnote" muted>
        Verified organisers first. Every organiser here has had an event checked by our team.
      </AppText>
    </Container>
  );

  if (data === undefined && error) {
    return <EmptyState icon={UsersThree} title="Couldn’t load organisers" body={error} action={{ label: 'Try again', onPress: reload }} />;
  }

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(o) => o.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      renderItem={({ item }) => (
        <Container>
          <OrganizerCard org={item} label={item.verified ? 'Verified organiser' : 'Organiser'} detail={detailFor(item)} />
        </Container>
      )}
      ListEmptyComponent={
        data === undefined ? (
          <Container style={styles.loading}>
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} height={72} />
            ))}
          </Container>
        ) : (
          <EmptyState
            icon={UsersThree}
            title={debounced ? `No organisers match “${debounced}”` : 'No organisers yet'}
            body={debounced ? 'Check the spelling, or search for part of the name.' : 'Organisers appear here once their first event is live.'}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.xxl },
  head: { gap: space.sm, paddingTop: space.md, paddingBottom: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: minTouchTarget + 4, borderRadius: radius.pill },
  input: { flex: 1, paddingVertical: space.sm },
  sep: { height: space.sm },
  loading: { gap: space.sm },
});
