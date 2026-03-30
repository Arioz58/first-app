import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import '../../lib/i18n';

const _layout = () => {
  return (
    <Tabs>
        <Tabs.Screen
        name='index'
        options={{
            headerShown: false,
            title : 'Home',
            tabBarIcon: ({ color, size }) => (
                <Ionicons name='home' color={color} size={size} />
            ),
        }}
        />
        <Tabs.Screen
        name='search'
        options={{
            headerShown: false,
            title : 'Search',
            tabBarIcon: ({ color, size }) => (
                <Ionicons name='search' color={color} size={size} />
            ),
        }}
        />
        <Tabs.Screen
        name='saved'
        options={{
            headerShown: false,
            title : 'Saved',
            tabBarIcon: ({ color, size }) => (
                <Ionicons name='bookmark' color={color} size={size} />
            ),
        }}
        />
        <Tabs.Screen
        name='profile'
        options={{
            headerShown: false,
            title : 'Profile',
            tabBarIcon: ({ color, size }) => (
                <Ionicons name='person' color={color} size={size} />
            ),
        }}
        />
    </Tabs>
  )
}

export default _layout