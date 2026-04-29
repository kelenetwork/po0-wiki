import { useEffect } from 'react';
import AdminApp from '../../components/admin/AdminApp';

export default function AdminAgentsPage() {
  useEffect(() => {
    window.location.replace('/admin/sources');
  }, []);
  return <AdminApp page="agents" />;
}
