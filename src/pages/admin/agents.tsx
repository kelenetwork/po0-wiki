import { useEffect } from 'react';
import AdminApp from '../../components/admin/AdminApp';

export default function AdminAgentsPage() {
  useEffect(() => {
    window.location.replace('/admin/sources');
  }, []);
  return <div style={{ maxWidth: 'none', padding: 0 }}><AdminApp page="agents" /></div>;
}
