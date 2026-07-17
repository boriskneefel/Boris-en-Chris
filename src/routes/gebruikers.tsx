import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, UserCircle } from "lucide-react";
import { useLocalUsers } from "../hooks/useLocalUsers";
import { useClusters } from "../hooks/useClusters";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

export const Route = createFileRoute("/gebruikers")({
  head: () => ({
    meta: [
      { title: "Gebruikers — Admin" },
      {
        name: "description",
        content:
          "Beheer lokale gebruikers, hun rol en cluster, en de actieve gebruiker.",
      },
    ],
  }),
  component: GebruikersPage,
});

function GebruikersPage() {
  const {
    users,
    activeUserId,
    addUser,
    updateUser,
    removeUser,
    setActiveUser,
  } = useLocalUsers();
  const { clusters } = useClusters();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">Gebruikers</h1>
          <p className="text-sm text-black/50">
            Lokale gebruikers. Rolwissel is puur cosmetisch — alle pagina's
            blijven toegankelijk.
          </p>
        </div>
        <Button onClick={addUser}>
          <Plus className="h-4 w-4" />
          Gebruiker toevoegen
        </Button>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Actieve gebruiker</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="mb-1.5 block">Selecteer</Label>
          {users.length > 0 ? (
            <Select
              value={activeUserId ?? ""}
              onChange={(e) => setActiveUser(e.target.value || null)}
            >
              <option value="">— geen —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-black/40">Nog geen gebruikers.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alle gebruikers</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <UserCircle className="mb-3 h-10 w-10 text-black/20" />
              <p className="text-sm text-black/50">
                Nog geen gebruikers toegevoegd.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead className="w-40">Rol</TableHead>
                    <TableHead className="w-56">Cluster</TableHead>
                    <TableHead className="w-20 text-right">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Input
                          value={u.name}
                          onChange={(e) =>
                            updateUser(u.id, { name: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.role}
                          onChange={(e) =>
                            updateUser(u.id, {
                              role: e.target.value as "admin" | "user",
                            })
                          }
                        >
                          <option value="user">Gebruiker</option>
                          <option value="admin">Beheerder</option>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.cluster_id ?? ""}
                          onChange={(e) =>
                            updateUser(u.id, {
                              cluster_id: e.target.value || null,
                            })
                          }
                        >
                          <option value="">— geen —</option>
                          {clusters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeUser(u.id)}
                          title="Verwijderen"
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
