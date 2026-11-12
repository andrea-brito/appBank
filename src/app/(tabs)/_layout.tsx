import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#6366f1', tabBarLabelStyle: { lineHeight: 14 }, tabBarIconStyle: { height: 22 } }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Resumo',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18, lineHeight: 20 }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Metas',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18, lineHeight: 20 }}>🎯</Text>,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18, lineHeight: 20 }}>📅</Text>,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Orçamento',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18, lineHeight: 20 }}>🧮</Text>,
        }}
      />
    </Tabs>
  );
}
