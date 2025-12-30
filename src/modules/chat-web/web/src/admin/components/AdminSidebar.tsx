import { NavLink, useLocation } from 'react-router-dom';
import styles from './AdminSidebar.module.scss';

interface NavItem {
  path: string;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: 'OVERVIEW',
    items: [{ path: '/admin', label: 'Dashboard' }],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { path: '/admin/agents', label: 'Agents' },
      { path: '/admin/modules', label: 'Modules' },
      { path: '/admin/templates', label: 'Templates' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [{ path: '/admin/health', label: 'Health' }],
  },
];

const AdminSidebar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.title}>AMPELOS</div>
        <div className={styles.subtitle}>ADMIN</div>
      </div>

      <div className={styles.divider} />

      {sections.map((section) => (
        <div key={section.title} className={styles.section}>
          <div className={styles.sectionTitle}>{section.title}</div>
          <ul className={styles.navList}>
            {section.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={`${styles.navItem} ${isActive(item.path) ? styles.active : ''}`}
                  end={item.path === '/admin'}
                >
                  <span className={styles.indicator}>{isActive(item.path) ? '>' : ' '}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className={styles.spacer} />

      <div className={styles.divider} />

      <NavLink to="/" className={styles.backLink}>
        &larr; Back to Chat
      </NavLink>
    </nav>
  );
};

export default AdminSidebar;
