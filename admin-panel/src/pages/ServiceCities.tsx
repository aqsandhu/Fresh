import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/services/api';
import toast from 'react-hot-toast';

interface ServiceCity {
  id: string;
  name: string;
  province: string;
  isActive: boolean;
  createdAt: string;
}

export const ServiceCities: React.FC = () => {
  const [newCity, setNewCity] = useState('');
  const [newProvince, setNewProvince] = useState('Punjab');
  const queryClient = useQueryClient();

  const { data: cities = [], isLoading } = useQuery<ServiceCity[]>({
    queryKey: ['service-cities'],
    queryFn: async () => {
      const res: any = await api.get('/admin/cities');
      return res?.data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await api.post('/admin/cities', { name: newCity, province: newProvince });
    },
    onSuccess: () => {
      toast.success('City added');
      setNewCity('');
      queryClient.invalidateQueries({ queryKey: ['service-cities'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to add city');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/admin/cities/${id}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-cities'] });
    },
    onError: () => {
      toast.error('Failed to update city');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/cities/${id}`);
    },
    onSuccess: () => {
      toast.success('City deleted');
      queryClient.invalidateQueries({ queryKey: ['service-cities'] });
    },
    onError: () => {
      toast.error('Failed to delete city');
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCity.trim()) {
      toast.error('Enter city name');
      return;
    }
    addMutation.mutate();
  };

  return (
    <Layout title="Service Cities" subtitle="Manage cities where delivery is available">
      <Card className="mb-6">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              label="City Name"
              placeholder="e.g., Lahore"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Province"
              placeholder="e.g., Punjab"
              value={newProvince}
              onChange={(e) => setNewProvince(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={addMutation.isPending}>
            <Plus className="w-4 h-4 mr-2" />
            Add City
          </Button>
        </form>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-gray-500 py-4 text-center">Loading...</p>
        ) : cities.length === 0 ? (
          <p className="text-gray-500 py-4 text-center">No cities added yet</p>
        ) : (
          <div className="divide-y">
            {cities.map((city) => (
              <div key={city.id} className="flex items-center justify-between py-3 px-2">
                <div className="flex items-center gap-3">
                  <MapPin className={`w-5 h-5 ${city.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                  <div>
                    <span className="font-medium">{city.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({city.province})</span>
                  </div>
                  {city.isActive ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleMutation.mutate(city.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title={city.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {city.isActive ? (
                      <ToggleRight className="w-5 h-5 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${city.name}?`)) {
                        deleteMutation.mutate(city.id);
                      }
                    }}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
};
