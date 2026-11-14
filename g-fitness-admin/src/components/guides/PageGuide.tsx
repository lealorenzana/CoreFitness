import { useNavigate } from 'react-router-dom';
import { GuideButton } from './GuidePlayer';

/** Admin-only: a "How to set this up" button that opens one guide; "Take me there" stays inside the app. */
export default function PageGuide({ id, label }: { id: string; label?: string }) {
  const navigate = useNavigate();
  return <GuideButton id={id} label={label} onGo={(path) => navigate(path)} />;
}
