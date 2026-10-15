import {
  ConnectionProvider,
  ConnectionStatus,
  PublishJobStatus,
  TargetType,
} from '@autospace/database';

type ProviderConnectionSnapshot = {
  id: string;
  name: string;
  provider: ConnectionProvider;
  status: ConnectionStatus;
} | null;

export type ProviderTargetSnapshot = {
  id: string;
  name: string;
  type: TargetType;
  externalId: string | null;
  connection: ProviderConnectionSnapshot;
};

export type ProviderPreparation = {
  status: PublishJobStatus;
  provider: string;
  message: string;
};

interface ProviderAdapter {
  key: string;
  supports(target: ProviderTargetSnapshot): boolean;
  prepare(target: ProviderTargetSnapshot): ProviderPreparation;
}

function connectionPreparation(
  target: ProviderTargetSnapshot,
  expectedProvider: ConnectionProvider,
  providerName: string,
): ProviderPreparation {
  if (!target.connection) {
    return {
      status: PublishJobStatus.WAITING_CONNECTION,
      provider: providerName,
      message: 'Target chưa được gắn provider connection.',
    };
  }

  if (target.connection.provider !== expectedProvider) {
    return {
      status: PublishJobStatus.WAITING_CONNECTION,
      provider: providerName,
      message: `Connection không đúng loại provider: ${target.connection.provider}`,
    };
  }

  if (target.connection.status !== ConnectionStatus.CONNECTED) {
    return {
      status: PublishJobStatus.WAITING_CONNECTION,
      provider: providerName,
      message: `Connection ${target.connection.name} đang ở trạng thái ${target.connection.status}.`,
    };
  }

  return {
    status: PublishJobStatus.READY_FOR_PROVIDER,
    provider: providerName,
    message: `Connection ${target.connection.name} hợp lệ. Dry Run dừng trước bước publish thật.`,
  };
}

const facebookPageProvider: ProviderAdapter = {
  key: 'facebook-page',
  supports: (target) => target.type === TargetType.FACEBOOK_PAGE,
  prepare: (target) => connectionPreparation(
    target,
    ConnectionProvider.FACEBOOK_PAGE,
    'facebook-page',
  ),
};

const websiteProvider: ProviderAdapter = {
  key: 'website',
  supports: (target) => target.type === TargetType.WEBSITE,
  prepare: (target) => connectionPreparation(
    target,
    ConnectionProvider.WEBSITE,
    'website',
  ),
};

const adapters: ProviderAdapter[] = [facebookPageProvider, websiteProvider];

export function prepareProvider(target: ProviderTargetSnapshot): ProviderPreparation {
  const adapter = adapters.find((candidate) => candidate.supports(target));
  if (!adapter) {
    return {
      status: PublishJobStatus.WAITING_CONNECTION,
      provider: 'unsupported',
      message: `Chưa có provider adapter cho target type ${target.type}.`,
    };
  }
  return adapter.prepare(target);
}
