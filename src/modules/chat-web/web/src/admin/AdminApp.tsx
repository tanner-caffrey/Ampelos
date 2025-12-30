import { Routes, Route } from 'react-router-dom';
import SidebarLayout from '../sacred/components/SidebarLayout';
import AdminSidebar from './components/AdminSidebar';
import DashboardPage from './pages/DashboardPage';
import AgentsListPage from './pages/AgentsListPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AgentCreatePage from './pages/AgentCreatePage';
import ModulesPage from './pages/ModulesPage';
import TemplatesPage from './pages/TemplatesPage';
import HealthPage from './pages/HealthPage';
import styles from './AdminApp.module.scss';

const AdminApp: React.FC = () => {
  return (
    <div className={styles.root}>
      <SidebarLayout sidebar={<AdminSidebar />} defaultSidebarWidth={24}>
        <div className={styles.content}>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="agents" element={<AgentsListPage />} />
            <Route path="agents/new" element={<AgentCreatePage />} />
            <Route path="agents/:agentId" element={<AgentDetailPage />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="health" element={<HealthPage />} />
          </Routes>
        </div>
      </SidebarLayout>
    </div>
  );
};

export default AdminApp;
