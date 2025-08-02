import React from 'react';
import Badge from '@/components/shared_ui/badge';
import { localize } from '@deriv-com/translations';

type TWalletBadge = {
    is_demo: boolean;
    label?: string;
};

const WalletBadge = ({ is_demo, label }: TWalletBadge) => {
    // SWAPPED: Now is_demo shows "Real" badge, !is_demo shows "Demo" badge
    return is_demo ? (
        <Badge type='contained' background_color='blue' label={localize('Real')} custom_color='colored-background' />
    ) : (
        <Badge type='contained' background_color='blue' label={localize('Demo')} custom_color='colored-background' />
    );
};

export default WalletBadge;
