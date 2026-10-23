import React from 'react';
import { Database, Clock, Sparkles, Plus, Edit3, Trash2, Eye } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useRouter } from '../../router/Router';
import { PermissionGate } from '../../components/auth/PermissionGate';
import { useAuth } from '../../context/AuthContext';
import type { Permission } from '../../auth/permissions';

interface PlaceholderProps {
  moduleName: string;
  description: string;
  collectionName: string;
  plannedFeatures: string[];
  icon: React.ReactNode;
  createPermission?: Permission;
  updatePermission?: Permission;
  deletePermission?: Permission;
}

export const AdminModulePlaceholder: React.FC<PlaceholderProps> = ({
  moduleName,
  description,
  collectionName,
  plannedFeatures,
  icon,
  createPermission,
  updatePermission,
  deletePermission,
}) => {
  const { navigate } = useRouter();
  const { role, hasPermission } = useAuth();

  const canCreate = createPermission ? hasPermission(createPermission) : false;
  const canUpdate = updatePermission ? hasPermission(updatePermission) : false;
  const canDelete = deletePermission ? hasPermission(deletePermission) : false;

  const isReadOnly = !canCreate && !canUpdate && !canDelete;

  return (
    <div className="space-y-6">
      {/* Module Title Header */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[#171513] tracking-tight">{moduleName}</h2>
              {isReadOnly ? (
                <Badge variant="neutral">Read-Only Mode</Badge>
              ) : (
                <Badge variant="gold">Authorized Editor</Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#6B7280] mt-1">{description}</p>
          </div>
        </div>

        {/* Action Controls Guarded by Granular Permissions */}
        <div className="flex items-center flex-wrap gap-2">
          {createPermission && (
            <PermissionGate permission={createPermission}>
              <Button
                variant="gold"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => alert(`Create action permitted for ${role}`)}
              >
                Create
              </Button>
            </PermissionGate>
          )}

          {updatePermission && (
            <PermissionGate permission={updatePermission}>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                onClick={() => alert(`Edit action permitted for ${role}`)}
              >
                Edit
              </Button>
            </PermissionGate>
          )}

          {deletePermission && (
            <PermissionGate permission={deletePermission}>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => alert(`Delete action permitted for ${role}`)}
              >
                Delete
              </Button>
            </PermissionGate>
          )}

          <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* Target Schema & Ready Architecture Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title={`${moduleName} Permissions & Scaffolding`}
              subtitle={`Current role (${role}) permission access status`}
            />
            <CardContent className="space-y-4">
              {/* Permission summary card */}
              <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#171513]">
                    <Eye className="w-4 h-4 text-[#B7791F]" />
                    <span>Your Access Level for this Module:</span>
                  </div>
                  <span className="text-xs font-semibold capitalize text-[#B7791F]">
                    Role: {role}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] font-medium border border-[#DBEAFE]">
                    View: Granted
                  </span>
                  {createPermission && (
                    <span
                      className={`px-2 py-0.5 rounded font-medium border ${
                        canCreate
                          ? 'bg-[#F0FDF4] text-[#16A34A] border-[#DCFCE7]'
                          : 'bg-[#FEF2F2] text-[#DC2626] border-[#FEE2E2]'
                      }`}
                    >
                      Create: {canCreate ? 'Granted' : 'Restricted'}
                    </span>
                  )}
                  {updatePermission && (
                    <span
                      className={`px-2 py-0.5 rounded font-medium border ${
                        canUpdate
                          ? 'bg-[#F0FDF4] text-[#16A34A] border-[#DCFCE7]'
                          : 'bg-[#FEF2F2] text-[#DC2626] border-[#FEE2E2]'
                      }`}
                    >
                      Update: {canUpdate ? 'Granted' : 'Restricted'}
                    </span>
                  )}
                  {deletePermission && (
                    <span
                      className={`px-2 py-0.5 rounded font-medium border ${
                        canDelete
                          ? 'bg-[#F0FDF4] text-[#16A34A] border-[#DCFCE7]'
                          : 'bg-[#FEF2F2] text-[#DC2626] border-[#FEE2E2]'
                      }`}
                    >
                      Delete: {canDelete ? 'Granted' : 'Restricted'}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#171513] mb-2 uppercase tracking-wider">
                  Planned Capabilities for this Module:
                </h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#4B5563]">
                  {plannedFeatures.map((feat, index) => (
                    <li
                      key={index}
                      className="p-2.5 rounded-lg border border-[#E5E7EB] bg-white flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#B7791F] shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader
              title="Database Integration"
              subtitle="Target collection in shared Firebase"
            />
            <CardContent className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-[#FEF9EE] border border-[#FCEEC8]">
                <span className="text-[11px] font-semibold text-[#B7791F] uppercase block">
                  Connected Collection
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Database className="w-4 h-4 text-[#B7791F]" />
                  <code className="text-xs font-mono font-bold text-[#171513]">
                    {collectionName}
                  </code>
                </div>
              </div>

              <div className="text-[11px] text-[#6B7280] space-y-1">
                <p>• Uses existing Musha Empire Firebase project.</p>
                <p>• Shared with customer-facing web application.</p>
                <p>• Protected by Firestore role verification.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
