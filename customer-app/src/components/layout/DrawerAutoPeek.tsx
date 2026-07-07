import { useEffect } from 'react';
import { useLeftDrawer, useRightDrawer } from '@store/drawerUi';
import { useCityContext } from '@/context/CityContext';
import { useActiveRouteName } from '@/lib/activeRoute';

const PEEK_DELAY_MS = 600;
const PEEK_DURATION_MS = 1800;

/**
 * Welcome peek: when Home opens, both edge drawers slide open for ~1.8s and
 * close again — so shoppers discover the pull handles (mirrors website
 * DrawerAutoPeek).
 */
export const DrawerAutoPeek: React.FC = () => {
  const { selectedCityId } = useCityContext();
  const setLeft = useLeftDrawer((s) => s.setOpen);
  const setRight = useRightDrawer((s) => s.setOpen);
  const route = useActiveRouteName();

  useEffect(() => {
    if (route !== 'HomeMain' || !selectedCityId) return;

    const openTimer = setTimeout(() => {
      // peek = true → no dark backdrop, both edges peek over the visible page.
      setLeft(true, true);
      setRight(true, true);
    }, PEEK_DELAY_MS);
    const closeTimer = setTimeout(() => {
      setLeft(false);
      setRight(false);
    }, PEEK_DELAY_MS + PEEK_DURATION_MS);

    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      setLeft(false);
      setRight(false);
    };
  }, [route, selectedCityId, setLeft, setRight]);

  return null;
};

export default DrawerAutoPeek;
