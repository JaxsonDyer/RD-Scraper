"use client";

import { Fragment, useRef, useState } from "react";
import { History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { Checkbox, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { LoadingState } from "@/components/ui/spinner";
import { Table, TableFrame, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { RelativeTime } from "@/components/relative-time";
import { useToast } from "@/components/toast";
import { DeepScrapePanel } from "./deep-scrape-panel";
import { errorMessage, type Config, type SaveConfig, type ScrapedAccount } from "./types";

const MAX_TARGETS = 50;

type Row = { username: string; fullName: string | null; lastChecked: string | null; totalPosts: number | null };

const key = (username: string) => username.toLowerCase();

export function AccountsSection({ config, saveConfig, accounts, accountsError, onRetryAccounts, onQueued, timeZone }: {
  config: Config;
  saveConfig: SaveConfig;
  /** Overview's list; null while loading. */
  accounts: ScrapedAccount[] | null;
  accountsError: string | null;
  onRetryAccounts: () => void;
  onQueued: () => void;
  timeZone: string;
}) {
  const toast = useToast();
  const [newAccount, setNewAccount] = useState("");
  // Daily-scrape changes still being saved, shown right away. Each carries the change it
  // came from, so an older save finishing can't clear a newer click on the same account.
  const [pending, setPending] = useState<Record<string, { include: boolean; change: number }>>({});
  const changes = useRef(0);
  const [deepFor, setDeepFor] = useState<string | null>(null);

  const targets = new Set(config.target_accounts.map(key));
  const isDaily = (username: string) => pending[key(username)]?.include ?? targets.has(key(username));

  // Overview's accounts in Overview's order, then daily-scrape accounts that haven't been scraped yet.
  const rows: Row[] = (accounts ?? []).map(account => ({
    username: account.username, fullName: account.full_name, lastChecked: account.date_checked, totalPosts: account.total_posts,
  }));
  const listed = new Set(rows.map(row => key(row.username)));
  for (const username of [...config.target_accounts, ...Object.keys(pending).filter(name => pending[name].include)]) {
    if (listed.has(key(username))) continue;
    listed.add(key(username));
    rows.push({ username, fullName: null, lastChecked: null, totalPosts: null });
  }
  const dailyCount = rows.filter(row => isDaily(row.username)).length;

  // Several accounts change in one save, so "Include all" is a single request.
  const setDaily = async (usernames: string[], include: boolean) => {
    const ids = usernames.map(key);
    const change = ++changes.current;
    setPending(current => ({ ...current, ...Object.fromEntries(ids.map(id => [id, { include, change }])) }));
    try {
      await saveConfig(saved => ({
        target_accounts: include
          ? [...saved.target_accounts, ...usernames.filter(name => !saved.target_accounts.some(target => key(target) === key(name)))]
          : saved.target_accounts.filter(name => !ids.includes(key(name))),
      }));
      const [username] = usernames;
      const scraped = accounts?.some(account => key(account.username) === key(username));
      toast.success(usernames.length > 1 ? `Added ${usernames.length} accounts to the daily scrape.`
        : include ? `@${username} added to the daily scrape.${scraped ? "" : " It appears on Overview after its first scrape."}`
        : `@${username} removed from the daily scrape.${scraped ? " Its data stays on Overview." : ""}`);
    } catch (error) {
      toast.error(errorMessage(error, usernames.length > 1 ? "Could not update the daily scrape." : `Could not update @${usernames[0]}.`));
    } finally {
      setPending(current => {
        const next = { ...current };
        for (const id of ids) if (next[id]?.change === change) delete next[id];
        return next;
      });
    }
  };

  const excluded = rows.filter(row => !isDaily(row.username)).map(row => row.username);
  const includeAll = () => {
    if (rows.length > MAX_TARGETS) {
      toast.error(`The daily scrape can include at most ${MAX_TARGETS} accounts; there are ${rows.length}.`);
      return;
    }
    void setDaily(excluded, true);
  };

  const addAccount = () => {
    const username = newAccount.trim().replace(/^@/, "");
    if (!username) return;
    if (!/^[A-Za-z0-9_.]{1,30}$/.test(username)) {
      toast.error("Enter an Instagram username: letters, numbers, periods and underscores.");
      return;
    }
    setNewAccount("");
    if (isDaily(username)) {
      toast.info(`@${username} is already in the daily scrape.`);
      return;
    }
    if (dailyCount >= MAX_TARGETS) {
      toast.error(`The daily scrape can include at most ${MAX_TARGETS} accounts.`);
      return;
    }
    void setDaily([username], true);
  };

  return (
    <Section title="Accounts" id="accounts-heading"
      description="Every account shown on Overview. Accounts in the daily scrape are collected on each scrape and used for AI insights; the rest keep the data already collected. Changes here save right away."
      action={rows.length > 0 && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">{dailyCount} of {rows.length} in the daily scrape</p>
          {excluded.length > 0 && <Button variant="ghost" size="sm" className="-my-1.5" onPress={includeAll}>Include all</Button>}
        </div>
      )}>
      <div className="space-y-3">
        <div className="flex items-end gap-2 sm:max-w-lg">
          <TextField label="Add an account to the daily scrape" hideLabel value={newAccount} onChange={setNewAccount} onEnter={addAccount}
            placeholder="Add an account, e.g. reddeer" className="flex-1" />
          <Button onPress={addAccount} isDisabled={!newAccount.trim()} icon={<Plus aria-hidden="true" />}>Add</Button>
        </div>

        {accountsError && (
          <Notice tone="error" action={<Button size="sm" variant="ghost" onPress={onRetryAccounts}>Retry</Button>}>
            Could not load Overview&apos;s accounts ({accountsError}). Showing the daily scrape list only.
          </Notice>
        )}

        <TableFrame>
          {accounts === null && !accountsError ? <LoadingState label="Loading accounts..." /> : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No accounts yet. Add an Instagram account to start scraping it.</p>
          ) : (
            <Table>
              <TableHead>
                <Th>Account</Th>
                <Th align="center" className="w-28">Daily scrape</Th>
                <Th className="hidden md:table-cell">Last scraped</Th>
                <Th align="right" className="w-14 sm:w-36"><span className="sr-only">Actions</span></Th>
              </TableHead>
              <tbody>
                {rows.map(row => {
                  const open = deepFor === key(row.username);
                  return (
                    <Fragment key={key(row.username)}>
                      <Tr className={open ? "border-b-0 bg-muted/30" : undefined}>
                        {/* max-w-0 lets the account column take the remaining width and truncate inside it. */}
                        <Td className="max-w-0 py-2.5">
                          <p className="truncate font-medium leading-5 text-foreground" title={row.fullName || `@${row.username}`}>
                            {row.fullName || `@${row.username}`}
                          </p>
                          {row.fullName && <p className="truncate text-xs leading-4 text-muted-foreground">@{row.username}</p>}
                          <p className="text-xs leading-4 text-muted-foreground md:hidden">
                            {row.lastChecked ? <>Scraped <RelativeTime value={row.lastChecked} timeZone={timeZone} /></> : "Not scraped yet"}
                          </p>
                        </Td>
                        <Td align="center" className="py-1">
                          <Checkbox isSelected={isDaily(row.username)} onChange={include => void setDaily([row.username], include)} className="justify-center">
                            <span className="sr-only">Include @{row.username} in the daily scrape</span>
                          </Checkbox>
                        </Td>
                        <Td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                          {row.lastChecked ? <RelativeTime value={row.lastChecked} timeZone={timeZone} className="inline-block first-letter:uppercase" /> : "Not scraped yet"}
                        </Td>
                        <Td align="right" className="py-1.5">
                          <Button variant="ghost" size="sm" onPress={() => setDeepFor(open ? null : key(row.username))}
                            aria-expanded={open} aria-label={`Deep scrape @${row.username}`} icon={<History aria-hidden="true" />}>
                            <span className="hidden sm:inline">Deep scrape</span>
                          </Button>
                        </Td>
                      </Tr>
                      {open && (
                        <tr className="border-b border-border last:border-0">
                          <td colSpan={4} className="p-0">
                            <DeepScrapePanel username={row.username} knownTotal={row.totalPosts} lookbackDays={config.post_lookback_days}
                              onClose={() => setDeepFor(null)} onQueued={onQueued} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
        </TableFrame>
      </div>
    </Section>
  );
}
