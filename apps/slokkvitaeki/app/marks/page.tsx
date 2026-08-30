import { redirect } from "next/navigation";

const MARKS_URL = "https://kjarni-3dwork.vercel.app/marks";

export default function MarksPage() {
  redirect(MARKS_URL);
}
