/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { NxButton, NxCard } from './NxPrimitives.tsx';

interface ErrorBoundaryProps {
  zoneName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected rendering error.',
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 flex-1 flex items-center justify-center min-h-[200px]">
          <NxCard className="p-5 max-w-md w-full space-y-3">
            <div className="flex items-center gap-2 font-semibold text-sm" style={{ color: 'var(--status-danger)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{this.props.zoneName} encountered a UI error</span>
            </div>
            <p className="text-xs font-mono nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
              {this.state.message}
            </p>
            <NxButton size="sm" variant="secondary" onClick={this.handleReset}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Recover Section</span>
            </NxButton>
          </NxCard>
        </div>
      );
    }

    return this.props.children;
  }
}
