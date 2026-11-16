import { redirect } from "next/navigation";

// Keep old bookmarks working; account creation is now managed inside Accounts.
export default function Page() {
  redirect("/admin/users?create=bulk");
}
