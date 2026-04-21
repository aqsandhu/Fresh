import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TasksListScreen from '../screens/tasks/TasksListScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import { TasksStackParamList } from '../types';

const Stack = createNativeStackNavigator<TasksStackParamList>();

const TasksNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="TasksList" component={TasksListScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
    </Stack.Navigator>
  );
};

export default TasksNavigator;
