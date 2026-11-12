import { ask } from './dialog';

// A destructive yes/no question, in the app's own dialog.
export function confirm(title: string, body: string, action: string, run: () => void) {
  ask({ title, body, action, tone: 'danger' }).then((ok) => {
    if (ok) run();
  });
}
