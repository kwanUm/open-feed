import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Tag } from '../types'

const DEFAULT_TAGS: Tag[] = [
  // Languages
  { value: 'javascript', label: 'Javascript', category: 'language' },
  { value: 'typescript', label: 'Typescript', category: 'language' },
  { value: 'python', label: 'Python', category: 'language' },
  { value: 'rust', label: 'Rust', category: 'language' },
  { value: 'go', label: 'Go', category: 'language' },
  { value: 'java', label: 'Java', category: 'language' },
  { value: 'kotlin', label: 'Kotlin', category: 'language' },
  { value: 'swift', label: 'Swift', category: 'language' },
  { value: 'ruby', label: 'Ruby', category: 'language' },
  { value: 'c++', label: 'C++', category: 'language' },
  { value: 'c#', label: 'C#', category: 'language' },
  { value: 'php', label: 'PHP', category: 'language' },
  { value: 'elixir', label: 'Elixir', category: 'language' },
  { value: 'haskell', label: 'Haskell', category: 'language' },
  { value: 'zig', label: 'Zig', category: 'language' },
  // Frontend
  { value: 'react', label: 'React', category: 'frontend' },
  { value: 'vue', label: 'Vue', category: 'frontend' },
  { value: 'angular', label: 'Angular', category: 'frontend' },
  { value: 'svelte', label: 'Svelte', category: 'frontend' },
  { value: 'nextjs', label: 'Next.js', category: 'frontend' },
  { value: 'nuxt', label: 'Nuxt', category: 'frontend' },
  { value: 'tailwindcss', label: 'Tailwind CSS', category: 'frontend' },
  { value: 'css', label: 'CSS', category: 'frontend' },
  { value: 'html', label: 'HTML', category: 'frontend' },
  // Backend & data
  { value: 'nodejs', label: 'Node.js', category: 'backend' },
  { value: 'django', label: 'Django', category: 'backend' },
  { value: 'flask', label: 'Flask', category: 'backend' },
  { value: 'rails', label: 'Rails', category: 'backend' },
  { value: 'spring', label: 'Spring', category: 'backend' },
  { value: 'fastapi', label: 'FastAPI', category: 'backend' },
  { value: 'graphql', label: 'GraphQL', category: 'backend' },
  { value: 'postgres', label: 'PostgreSQL', category: 'data' },
  { value: 'mysql', label: 'MySQL', category: 'data' },
  { value: 'mongodb', label: 'MongoDB', category: 'data' },
  { value: 'redis', label: 'Redis', category: 'data' },
  // Infra
  { value: 'kubernetes', label: 'Kubernetes', category: 'infra' },
  { value: 'docker', label: 'Docker', category: 'infra' },
  { value: 'aws', label: 'AWS', category: 'infra' },
  { value: 'gcp', label: 'GCP', category: 'infra' },
  { value: 'azure', label: 'Azure', category: 'infra' },
  { value: 'terraform', label: 'Terraform', category: 'infra' },
  { value: 'devops', label: 'DevOps', category: 'infra' },
  { value: 'linux', label: 'Linux', category: 'infra' },
  // AI / data
  { value: 'ai', label: 'AI', category: 'ai' },
  { value: 'machine-learning', label: 'Machine Learning', category: 'ai' },
  { value: 'llm', label: 'LLMs', category: 'ai' },
  { value: 'pytorch', label: 'PyTorch', category: 'ai' },
  { value: 'tensorflow', label: 'TensorFlow', category: 'ai' },
  { value: 'data-science', label: 'Data Science', category: 'ai' },
  // Mobile
  { value: 'ios', label: 'iOS', category: 'mobile' },
  { value: 'android', label: 'Android', category: 'mobile' },
  { value: 'react-native', label: 'React Native', category: 'mobile' },
  { value: 'flutter', label: 'Flutter', category: 'mobile' },
  // Other
  { value: 'web3', label: 'Web3', category: 'other' },
  { value: 'blockchain', label: 'Blockchain', category: 'other' },
  { value: 'security', label: 'Security', category: 'other' },
  { value: 'gamedev', label: 'Game Dev', category: 'other' },
  { value: 'design', label: 'Design', category: 'other' },
  { value: 'productivity', label: 'Productivity', category: 'other' },
  { value: 'startups', label: 'Startups', category: 'other' },
  { value: 'career', label: 'Career', category: 'other' },
]

type RemoteConfigStore = {
  tags: Tag[]
}

export const useRemoteConfigStore = create(
  persist<RemoteConfigStore>(
    () => ({
      tags: DEFAULT_TAGS,
    }),
    {
      name: 'remote_config_storage',
      version: 3,
      migrate: (state) => {
        const s = state as RemoteConfigStore
        s.tags = DEFAULT_TAGS
        return s
      },
    }
  )
)
