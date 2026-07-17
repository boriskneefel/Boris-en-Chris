import { createPersistentStore } from "../lib/persistentStore";
import type { LocalUser } from "../lib/types";
import { uuid } from "../lib/utils";

const usersStore = createPersistentStore<LocalUser[]>("users_v1", []);
const activeUserStore = createPersistentStore<string | null>(
  "active_user_v1",
  null,
);

export function useLocalUsers() {
  const users = usersStore.useValue();
  const activeUserId = activeUserStore.useValue();

  function addUser() {
    const user: LocalUser = {
      id: uuid(),
      name: "Nieuwe gebruiker",
      role: "user",
      cluster_id: null,
    };
    usersStore.set((prev) => [...prev, user]);
    if (activeUserStore.get() == null) activeUserStore.set(user.id);
  }

  function updateUser(id: string, patch: Partial<LocalUser>) {
    usersStore.set((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    );
  }

  function removeUser(id: string) {
    usersStore.set((prev) => prev.filter((u) => u.id !== id));
    if (activeUserStore.get() === id) {
      const remaining = usersStore.get();
      activeUserStore.set(remaining[0]?.id ?? null);
    }
  }

  function setActiveUser(id: string | null) {
    activeUserStore.set(id);
  }

  const activeUser = users.find((u) => u.id === activeUserId) ?? null;

  return {
    users,
    activeUserId,
    activeUser,
    addUser,
    updateUser,
    removeUser,
    setActiveUser,
  };
}

export { usersStore, activeUserStore };
