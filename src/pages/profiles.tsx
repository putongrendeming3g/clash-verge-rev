import useSWR, { mutate } from "swr";
import { useLockFn } from "ahooks";
import { useEffect, useMemo, useState } from "react";
import { useSetRecoilState } from "recoil";
import { Box, Button, Grid, IconButton, Stack, TextField } from "@mui/material";
import { CachedRounded } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import {
  getProfiles,
  patchProfile,
  patchProfilesConfig,
  importProfile,
  enhanceProfiles,
} from "@/services/cmds";
import { getProxies, updateProxy } from "@/services/api";
import { atomCurrentProfile } from "@/services/states";
import { BasePage, Notice } from "@/components/base";
import { ProfileNew } from "@/components/profile/profile-new";
import { ProfileItem } from "@/components/profile/profile-item";
import { EnhancedMode } from "@/components/profile/enhanced";

const ProfilePage = () => {
  const { t } = useTranslation();

  const [url, setUrl] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const setCurrentProfile = useSetRecoilState(atomCurrentProfile);

  const { data: profiles = {} } = useSWR("getProfiles", getProfiles);

  // distinguish type
  const { regularItems, enhanceItems } = useMemo(() => {
    const items = profiles.items || [];
    const chain = profiles.chain || [];

    const type1 = ["local", "remote"];
    const type2 = ["merge", "script"];

    const regularItems = items.filter((i) => type1.includes(i.type!));
    const restItems = items.filter((i) => type2.includes(i.type!));

    const restMap = Object.fromEntries(restItems.map((i) => [i.uid, i]));

    const enhanceItems = chain
      .map((i) => restMap[i]!)
      .concat(restItems.filter((i) => !chain.includes(i.uid)));

    return { regularItems, enhanceItems };
  }, [profiles]);

  // sync selected proxy
  useEffect(() => {
    if (profiles.current == null) return;

    const current = profiles.current;
    const profile = regularItems.find((p) => p.uid === current);

    setCurrentProfile(current);

    if (!profile) return;

    setTimeout(async () => {
      const proxiesData = await getProxies();
      mutate("getProxies", proxiesData);

      // init selected array
      const { selected = [] } = profile;
      const selectedMap = Object.fromEntries(
        selected.map((each) => [each.name!, each.now!])
      );

      let hasChange = false;

      const { global, groups } = proxiesData;
      [global, ...groups].forEach((group) => {
        const { name, now } = group;

        if (!now || selectedMap[name] === now) return;
        if (selectedMap[name] == null) {
          selectedMap[name] = now!;
        } else {
          hasChange = true;
          updateProxy(name, selectedMap[name]);
        }
      });

      // update profile selected list
      profile.selected = Object.entries(selectedMap).map(([name, now]) => ({
        name,
        now,
      }));

      patchProfile(current!, { selected: profile.selected });
      // update proxies cache
      if (hasChange) mutate("getProxies", getProxies());
    }, 100);
  }, [profiles, regularItems]);

  const onImport = async () => {
    if (!url) return;
    setUrl("");
    setDisabled(true);

    try {
      await importProfile(url);
      Notice.success("Successfully import profile.");

      getProfiles().then((newProfiles) => {
        mutate("getProfiles", newProfiles);

        const remoteItem = newProfiles.items?.find((e) => e.type === "remote");

        if (!newProfiles.current && remoteItem) {
          const current = remoteItem.uid;
          patchProfilesConfig({ current });
          mutate("getProfiles", { ...newProfiles, current }, true);
          mutate("getRuntimeLogs");
        }
      });
    } catch {
      Notice.error("Failed to import profile.");
    } finally {
      setDisabled(false);
    }
  };

  const onSelect = useLockFn(async (current: string, force: boolean) => {
    if (!force && current === profiles.current) return;

    try {
      await patchProfilesConfig({ current });
      setCurrentProfile(current);
      mutate("getProfiles", { ...profiles, current: current }, true);
      mutate("getRuntimeLogs");
      Notice.success("Refresh clash config", 1000);
    } catch (err: any) {
      Notice.error(err?.message || err.toString(), 4000);
    }
  });

  const onEnhance = useLockFn(async () => {
    try {
      await enhanceProfiles();
      mutate("getRuntimeLogs");
      // Notice.success("Refresh clash config", 1000);
    } catch (err: any) {
      Notice.error(err.message || err.toString(), 3000);
    }
  });

  return (
    <BasePage
      title={t("Profiles")}
      header={
        <Box sx={{ mt: 1, display: "flex", alignItems: "center" }}>
          <IconButton
            size="small"
            color="inherit"
            title={t("Refresh profiles")}
            onClick={onEnhance}
          >
            <CachedRounded />
          </IconButton>
        </Box>
      }
    >
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          hiddenLabel
          fullWidth
          size="small"
          value={url}
          variant="outlined"
          autoComplete="off"
          spellCheck="false"
          onChange={(e) => setUrl(e.target.value)}
          sx={{ input: { py: 0.65, px: 1.25 } }}
          placeholder={t("Profile URL")}
        />
        <Button
          disabled={!url || disabled}
          variant="contained"
          size="small"
          onClick={onImport}
        >
          {t("Import")}
        </Button>
        <Button
          variant="contained"
          size="small"
          onClick={() => setDialogOpen(true)}
        >
          {t("New")}
        </Button>
      </Stack>

      <Box sx={{ mb: 4.5 }}>
        <Grid container spacing={{ xs: 2, lg: 3 }}>
          {regularItems.map((item) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={item.file}>
              <ProfileItem
                selected={profiles.current === item.uid}
                itemData={item}
                onSelect={(f) => onSelect(item.uid, f)}
              />
            </Grid>
          ))}
        </Grid>
      </Box>

      {enhanceItems.length > 0 && (
        <EnhancedMode items={enhanceItems} chain={profiles.chain || []} />
      )}

      <ProfileNew open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </BasePage>
  );
};

export default ProfilePage;
